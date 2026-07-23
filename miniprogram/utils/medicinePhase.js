const PHASES = [
  {
    id: 'week1a', label: '第1周（1-4天）', range: [1, 4],
    medicines: [
      { name: '露达舒',   frequency: 6, color: '#FF6B9D', hint: '激素类，严禁擅自加量，滴药前请洗手' },
      { name: '玻璃酸钠', frequency: 4, color: '#4ECDC4', hint: '人工泪液，润滑眼表，开封首滴丢弃' },
      { name: '左氧氟沙星', frequency: 4, color: '#C3A6FF', hint: '抗菌消炎，预防感染' },
      { name: '地夸磷索钠', frequency: 4, color: '#FFD93D', hint: '促进泪液分泌' },
    ]
  },
  {
    id: 'week1b', label: '第1周（5-7天）', range: [5, 7],
    medicines: [
      { name: '露达舒',   frequency: 4, color: '#FF6B9D', hint: '激素类，严禁擅自加量' },
      { name: '玻璃酸钠', frequency: 4, color: '#4ECDC4', hint: '人工泪液，润滑眼表' },
      { name: '左氧氟沙星', frequency: 4, color: '#C3A6FF', hint: '抗菌消炎，预防感染' },
      { name: '地夸磷索钠', frequency: 4, color: '#FFD93D', hint: '促进泪液分泌' },
    ]
  },
  {
    id: 'week2', label: '第2周（8-14天）', range: [8, 14],
    medicines: [
      { name: '露达舒',   frequency: 3, color: '#FF6B9D', hint: '激素类，严格遵医嘱递减' },
      { name: '玻璃酸钠', frequency: 4, color: '#4ECDC4', hint: '人工泪液，润滑眼表' },
      { name: '左氧氟沙星', frequency: 4, color: '#C3A6FF', hint: '抗菌消炎，预防感染' },
      { name: '地夸磷索钠', frequency: 4, color: '#FFD93D', hint: '促进泪液分泌' },
    ]
  },
  {
    id: 'week3_4', label: '第3-4周（15-28天）', range: [15, 28],
    medicines: [
      { name: '玻璃酸钠', frequency: 4, color: '#4ECDC4', hint: '人工泪液，持续稳定，不可擅停' },
      { name: '聚乙二醇', frequency: 4, color: '#FF9500', hint: '人工泪液，保湿润滑' },
      { name: '环孢素',   frequency: 2, color: '#C3A6FF', hint: '必须严格间隔12小时，不可擅停', locked12h: true },
    ]
  }
]

// 所有药品列表（用于设置页）
const ALL_MEDICINES = [
  { name: '露达舒',   maxFreq: 6, color: '#FF6B9D' },
  { name: '玻璃酸钠', maxFreq: 4, color: '#4ECDC4' },
  { name: '左氧氟沙星', maxFreq: 4, color: '#C3A6FF' },
  { name: '地夸磷索钠', maxFreq: 4, color: '#FFD93D' },
  { name: '聚乙二醇', maxFreq: 4, color: '#FF9500' },
  { name: '环孢素',   maxFreq: 2, color: '#C3A6FF', locked12h: true },
]

function getDaysSinceSurgery(surgeryDate) {
  const surgery = new Date(surgeryDate)
  const today = new Date()
  surgery.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  // 手术当天=第0天，次日=第1天
  return Math.floor((today - surgery) / (1000 * 60 * 60 * 24))
}

function getCurrentPhase(surgeryDate) {
  const day = getDaysSinceSurgery(surgeryDate)
  if (day > 28) return null
  for (const phase of PHASES) {
    if (day >= phase.range[0] && day <= phase.range[1]) return phase
  }
  return null
}

function getWeekLabel(day) {
  if (day <= 7)  return '第1周恢复期'
  if (day <= 14) return '第2周恢复期'
  if (day <= 21) return '第3周恢复期'
  if (day <= 28) return '第4周恢复期'
  return '康复完成 🎉'
}

module.exports = { PHASES, ALL_MEDICINES, getDaysSinceSurgery, getCurrentPhase, getWeekLabel }
