const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const PUSHPLUS_TOKEN = process.env.PUSHPLUS_TOKEN

// 每日0点：解除PushPlus限制状态（每日重置）
exports.main = async (event, context) => {
  try {
    // 清除昨日的blocked状态（PushPlus限制是按天计算的）
    const statusRes = await db.collection('pushStatus').limit(1).get()
    if (statusRes.data[0]) {
      await db.collection('pushStatus').doc(statusRes.data[0]._id).remove()
      console.log('已清除PushPlus限制状态')
    }
    // 发送复查提醒（检查未来3天内的复查节点）
    await checkFollowupReminders()
    return { success: true, date: new Date().toISOString() }
  } catch (e) {
    console.error('dailyReset error', e)
    return { success: false, error: e.message }
  }
}

async function checkFollowupReminders() {
  try {
    const scheduleRes = await db.collection('followupSchedule').limit(1).get()
    if (!scheduleRes.data[0]) return
    const checkups = scheduleRes.data[0].checkups || []
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000)
    today.setUTCHours(0, 0, 0, 0)

    for (const c of checkups) {
      if (c.done) continue
      const target = new Date(c.targetDate)
      target.setUTCHours(0, 0, 0, 0)
      const diff = Math.ceil((target - today) / 86400000)

      let title = '', content = ''
      if (diff === 3) {
        title = `📅 复查提醒 - ${c.label}`
        content = `<p>您的<strong>${c.label}</strong>还有3天（${c.targetDate}），请提前预约挂号！</p>`
      } else if (diff === 1) {
        title = `🔔 明天复查！- ${c.label}`
        content = `<p>明天（${c.targetDate}）是您的<strong>${c.label}</strong>，请务必按时就诊！</p>`
      } else if (diff === 0) {
        title = `🏥 今天复查！- ${c.label}`
        content = `<p>今天是您的<strong>${c.label}</strong>日，请及时前往医院就诊 👁️</p>`
      }

      if (title) {
        if (!PUSHPLUS_TOKEN) return
        const https = require('https')
        const body = JSON.stringify({ token: PUSHPLUS_TOKEN, title, content, template: 'html', topic: '测试' })
        await new Promise(resolve => {
          const req = https.request({
            hostname: 'www.pushplus.plus', path: '/send/', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, res => { res.on('data', () => {}); res.on('end', resolve) })
          req.on('error', resolve)
          req.write(body); req.end()
        })
      }
    }
  } catch (e) {
    console.error('checkFollowupReminders error', e)
  }
}
