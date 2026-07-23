const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PUSHPLUS_TOKEN = process.env.PUSHPLUS_TOKEN

const PHASES = [
  { range: [1, 4],  medicines: [{ name: '露达舒', frequency: 6 }, { name: '玻璃酸钠', frequency: 4 }, { name: '左氧氟沙星', frequency: 4 }, { name: '地夸磷索钠', frequency: 4 }] },
  { range: [5, 7],  medicines: [{ name: '露达舒', frequency: 4 }, { name: '玻璃酸钠', frequency: 4 }, { name: '左氧氟沙星', frequency: 4 }, { name: '地夸磷索钠', frequency: 4 }] },
  { range: [8, 14], medicines: [{ name: '露达舒', frequency: 3 }, { name: '玻璃酸钠', frequency: 4 }, { name: '左氧氟沙星', frequency: 4 }, { name: '地夸磷索钠', frequency: 4 }] },
  { range: [15, 28],medicines: [{ name: '玻璃酸钠', frequency: 4 }, { name: '聚乙二醇', frequency: 4 }, { name: '环孢素', frequency: 2 }] },
]

function getNowBJ() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
}

function getDaysSince(surgeryDate) {
  const s = new Date(surgeryDate), t = getNowBJ()
  s.setUTCHours(0,0,0,0); t.setUTCHours(0,0,0,0)
  return Math.floor((t - s) / 86400000)
}

function getCurrentPhase(surgeryDate) {
  const day = getDaysSince(surgeryDate)
  if (day > 28) return null
  return PHASES.find(p => day >= p.range[0] && day <= p.range[1]) || null
}

function formatDate(d) {
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth()+1).padStart(2,'0')}-${String(bj.getUTCDate()).padStart(2,'0')}`
}

function toMins(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function sendPush(title, content) {
  if (!PUSHPLUS_TOKEN) return Promise.resolve({ code: -1, error: 'missing_pushplus_token' })

  return new Promise((resolve) => {
    const payload = { token: PUSHPLUS_TOKEN, title, content, template: 'html', topic: '测试' }
    const body = JSON.stringify(payload)
    const bodyBuffer = Buffer.from(body, 'utf8')
    const req = https.request({
      hostname: 'www.pushplus.plus', path: '/send/', method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': bodyBuffer.length  // 用字节长度，不是字符长度
      }
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        console.log('[push] 返回:', data)
        try { resolve(JSON.parse(data)) } catch { resolve({ code: -1 }) }
      })
    })
    req.on('error', e => { console.error('[push] 请求错误:', e); resolve({ code: -1 }) })
    req.write(bodyBuffer); req.end()
  })
}

exports.main = async (event, context) => {
  try {
    // 检查账号限制
    const statusRes = await db.collection('pushStatus').limit(1).get()
    if (statusRes.data[0]?.blocked) return { success: false, reason: 'blocked' }

    const cfgRes = await db.collection('userConfig').get()
    const cfg = cfgRes.data && cfgRes.data.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.reminderEnabled) return { success: true, reason: 'disabled' }

    const phase = getCurrentPhase(cfg.surgeryDate)
    if (!phase) return { success: true, reason: 'recovered' }

    const now = getNowBJ()
    const todayStr = formatDate(new Date())
    const currentHour = now.getUTCHours()
    const currentMin = now.getUTCMinutes()
    const nowMins = currentHour * 60 + currentMin
    const currentTimeStr = `${String(currentHour).padStart(2,'0')}:${String(currentMin).padStart(2,'0')}`

    // 获取今日打卡记录
    const checkinRes = await db.collection('dailyCheckin').where({ date: todayStr }).get()
    const checkin = checkinRes.data && checkinRes.data.length > 0 ? checkinRes.data[0] : null

    const schedule = cfg.reminderSchedule || {}

    // 21:30 收尾提醒（单独处理，不走常规逻辑）
    if (currentHour === 21 && currentMin >= 25 && currentMin <= 35) {
      const remaining = []
      phase.medicines.forEach(m => {
        const done = checkin?.medicines?.[m.name]?.done || 0
        if (done < m.frequency) remaining.push(`${m.name}（还需${m.frequency - done}次）`)
      })
      if (remaining.length > 0) {
        const content = `<p>今日还有以下用药未完成，请抓紧时间：</p><ul>${remaining.map(r => `<li>${r}</li>`).join('')}</ul>`
        const result = await sendPush('👁️ 今日用药收尾提醒', content)
        if (result.code === 900) await db.collection('pushStatus').add({ data: { blocked: true } })
      }
      return { success: true, type: 'summary' }
    }

    // ── 核心逻辑：扫描未来5分钟内要推送的时间点 ──
    // 窗口：(nowMins, nowMins+5]，即接下来5分钟内
    const windowEnd = nowMins + 5

    // 已推送记录：用 sentReminders 集合记录今日已推送的时间点，防止重复
    const sentKey = `${todayStr}`
    const sentRes = await db.collection('sentReminders').where({ date: sentKey }).limit(1).get()
    const sentDoc = sentRes.data[0]
    const sentSet = new Set(sentDoc ? (sentDoc.sent || []) : [])

    const reminders = []
    const newSent = []

    for (const med of phase.medicines) {
      const allTimes = schedule[med.name] || []
      const times = allTimes.slice(0, med.frequency) // 只取当前阶段实际频次
      const done = checkin?.medicines?.[med.name]?.done || 0
      if (done >= med.frequency) continue // 今日已全部完成，跳过

      for (const t of times) {
        const tMins = toMins(t)
        const sentKey2 = `${med.name}@${t}`
        // 落在未来5分钟窗口内 且 今日未推送过
        if (tMins > nowMins && tMins <= windowEnd && !sentSet.has(sentKey2)) {
          reminders.push({ name: med.name, time: t })
          newSent.push(sentKey2)
          break // 每种药每次触发最多推一个时间点
        }
      }
    }

    // 有需要推送的，发消息并记录已推送
    if (reminders.length > 0) {
      const day = getDaysSince(cfg.surgeryDate)
      const medList = reminders.map(r => `<li>${r.name}（${r.time}）</li>`).join('')
      const title = `💊 用药提醒 - 术后第${day}天`
      const content = `<p>接下来5分钟内需要滴眼药水：</p><ul>${medList}</ul><p>滴药前记得洗手 🙌</p>`
      const result = await sendPush(title, content)

      if (result.code === 900) {
        await db.collection('pushStatus').add({ data: { blocked: true } })
        return { success: false, reason: 'blocked' }
      }

      // 记录已推送，防止重复
      const allSent = [...sentSet, ...newSent]
      if (sentDoc) {
        await db.collection('sentReminders').doc(sentDoc._id).update({ data: { sent: allSent } })
      } else {
        await db.collection('sentReminders').add({ data: { date: sentKey, sent: allSent } })
      }

      console.log(`[reminder] 推送成功: ${reminders.map(r => r.name).join(',')}`)
      return { success: true, type: 'reminder', medicines: reminders.map(r => r.name), pushResult: result.code }
    }

    return { success: true, type: 'no_reminder_needed' }
  } catch (e) {
    console.error('reminder error', e)
    return { success: false, error: e.message }
  }
}
