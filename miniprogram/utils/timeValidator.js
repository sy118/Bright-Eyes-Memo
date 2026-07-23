function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function toTimeStr(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

// 校验所有药品时间跨药品5分钟间隔
function validateAllTimes(schedule) {
  const allTimes = []
  for (const [medicine, times] of Object.entries(schedule)) {
    for (const t of times) {
      if (t) allTimes.push({ mins: toMinutes(t), medicine, raw: t })
    }
  }
  allTimes.sort((a, b) => a.mins - b.mins)
  for (let i = 0; i < allTimes.length - 1; i++) {
    const diff = allTimes[i + 1].mins - allTimes[i].mins
    if (diff < 5) {
      return {
        valid: false,
        message: `${allTimes[i].medicine} ${allTimes[i].raw} 与 ${allTimes[i+1].medicine} ${allTimes[i+1].raw} 间隔不足5分钟`
      }
    }
  }
  return { valid: true }
}

// 校验环孢素必须间隔12小时以上
function validateCyclosporine(times) {
  if (!times || times.length !== 2) return { valid: false, message: '环孢素需要设置2个时间点' }
  const diff = Math.abs(toMinutes(times[1]) - toMinutes(times[0]))
  if (diff < 720) {
    const h = Math.floor(diff / 60), m = diff % 60
    return { valid: false, message: `环孢素两次间隔必须≥12小时，当前仅${h}小时${m}分钟` }
  }
  return { valid: true }
}

// 全局智能排班：所有药品一起排，保证跨药品≥5分钟间隔，从09:30开始
// medicines: [{ name, maxFreq, locked12h? }]
// 返回: { medicineName: ['09:30', '11:00', ...], ... }
function generateGlobalSchedule(medicines) {
  const start = 9 * 60 + 30  // 09:30
  const end   = 22 * 60       // 22:00
  const schedule = {}

  // 环孢素单独处理：09:30 和 21:30（间隔12小时）
  const cyclo = medicines.find(m => m.locked12h)
  if (cyclo) {
    schedule[cyclo.name] = ['09:30', '21:30']
  }

  // 其余药品：轮询交错排列，均匀分布在 09:40 ~ 21:20（避开环孢素±10分钟缓冲）
  const others = medicines.filter(m => !m.locked12h)
  if (others.length === 0) return schedule

  // 构建交错序列：round-robin，频次高的先排
  const sorted = [...others].sort((a, b) => b.maxFreq - a.maxFreq)
  const sequence = []
  const maxFreq = sorted[0].maxFreq
  for (let round = 0; round < maxFreq; round++) {
    for (const m of sorted) {
      if (round < m.maxFreq) sequence.push(m.name)
    }
  }

  const safeStart = cyclo ? start + 10 : start   // 09:40
  const safeEnd   = cyclo ? 21 * 60 + 20 : end   // 21:20
  const total = sequence.length
  const interval = total > 1 ? (safeEnd - safeStart) / (total - 1) : 0

  others.forEach(m => { schedule[m.name] = [] })
  sequence.forEach((name, i) => {
    schedule[name].push(toTimeStr(Math.round(safeStart + interval * i)))
  })

  return schedule
}

module.exports = { toMinutes, toTimeStr, validateAllTimes, validateCyclosporine, generateGlobalSchedule }
