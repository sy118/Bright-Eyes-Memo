const { PHASES } = require('../../utils/medicinePhase')
function getDB() { return wx.cloud.database() }

const CARE_LABELS = {
  noWater:    { label: '防污水入眼', icon: '💧' },
  noSport:    { label: '无剧烈运动', icon: '🏃' },
  lightDiet:  { label: '饮食清淡',   icon: '🥗' },
  noOveruse:  { label: '未过度用眼', icon: '👁️' },
}

const MED_COLORS = {
  '露达舒':    '#FF6B9D',
  '玻璃酸钠':  '#4ECDC4',
  '左氧氟沙星':'#C3A6FF',
  '地夸磷索钠':'#FFD93D',
  '聚乙二醇':  '#FF9500',
  '环孢素':    '#C3A6FF',
}

Page({
  data: {
    displayDate: '',
    hasData: false,
    allDone: false,
    medicines: [],
    careItems: [],
  },

  async onLoad(options) {
    const date = options.date
    if (!date) return
    // 格式化显示日期
    const [y, m, d] = date.split('-')
    this.setData({ displayDate: `${y}年${m}月${d}日` })
    wx.setNavigationBarTitle({ title: `${m}月${d}日打卡详情` })
    await this.loadDetail(date)
  },

  async loadDetail(date) {
    try {
      const res = await getDB().collection('dailyCheckin').where({ date }).limit(1).get()
      if (!res.data[0]) {
        this.setData({ hasData: false })
        return
      }
      const record = res.data[0]
      const medsRaw = record.medicines || {}
      const medicines = Object.entries(medsRaw).map(([name, val]) => ({
        name,
        done: val.done || 0,
        target: val.target || 0,
        logs: val.logs || [],
        color: MED_COLORS[name] || '#8E8E93',
        allDone: (val.done || 0) >= (val.target || 0),
      }))
      const careItems = Object.entries(CARE_LABELS).map(([key, info]) => ({
        key,
        label: info.label,
        icon: info.icon,
        checked: !!(record.careItems && record.careItems[key]),
      }))
      const allDone = medicines.length > 0 && medicines.every(m => m.allDone)
      this.setData({ hasData: true, medicines, careItems, allDone })
    } catch (e) {
      console.error('loadDetail error', e)
      this.setData({ hasData: false })
    }
  },
})
