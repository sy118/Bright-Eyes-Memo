function getDB() { return wx.cloud.database() }

Page({
  data: {
    streakDays: 0,
    totalRate: 0,
    totalDays: 0,
    calYear: 0,
    calMonth: 0,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calDays: [],
  },

  checkinMap: {},

  async onLoad() {
    const now = new Date()
    this.setData({ calYear: now.getFullYear(), calMonth: now.getMonth() + 1 })
    await this.loadAllCheckins()
  },

  onShow() { this.loadAllCheckins() },

  async loadAllCheckins() {
    try {
      const app = getApp()
      const surgeryDate = app.globalData.userConfig?.surgeryDate

      const res = await getDB().collection('dailyCheckin').orderBy('date', 'desc').limit(100).get()
      const map = {}
      let doneDays = 0

      for (const r of res.data) {
        const meds = Object.values(r.medicines || {})
        const allDone = meds.length > 0 && meds.every(m => m.done >= m.target)
        map[r.date] = allDone ? 'done' : 'miss'
        if (allDone) doneDays++
      }

      // 连续打卡：从今天往前数连续完成的天数
      let streak = 0
      const today = new Date()
      for (let i = 0; i < 60; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (map[ds] === 'done') streak++
        else break
      }

      // 总坚持天数：从手术日到今天，有打卡记录（不管完没完成）的天数
      let totalDays = 0
      if (surgeryDate) {
        const start = new Date(surgeryDate)
        const end = new Date()
        start.setHours(0,0,0,0); end.setHours(0,0,0,0)
        const totalPossible = Math.floor((end - start) / 86400000) + 1
        for (let i = 0; i < totalPossible; i++) {
          const d = new Date(start)
          d.setDate(d.getDate() + i)
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          if (map[ds]) totalDays++
        }
      } else {
        totalDays = res.data.length
      }

      // 完成率：有打卡记录的天里，全部完成的比例
      const totalRate = totalDays > 0 ? Math.round(doneDays / totalDays * 100) : 0

      this.checkinMap = map
      this.setData({ streakDays: streak, totalDays, totalRate })
      this.buildCalendar()
    } catch (e) {}
  },

  buildCalendar() {
    const { calYear, calMonth } = this.data
    const firstDay = new Date(calYear, calMonth - 1, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth, 0).getDate()
    const todayStr = (() => {
      const n = new Date()
      return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
    })()
    const calDays = []
    for (let i = 0; i < firstDay; i++) calDays.push({ empty: true })
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const isToday = ds === todayStr
      const status = isToday ? 'today' : (this.checkinMap[ds] || '')
      calDays.push({ day: d, empty: false, status, dateStr: ds })
    }
    this.setData({ calDays })
  },

  prevMonth() {
    let { calYear, calMonth } = this.data
    calMonth--
    if (calMonth < 1) { calMonth = 12; calYear-- }
    this.setData({ calYear, calMonth })
    this.buildCalendar()
  },

  nextMonth() {
    let { calYear, calMonth } = this.data
    calMonth++
    if (calMonth > 12) { calMonth = 1; calYear++ }
    this.setData({ calYear, calMonth })
    this.buildCalendar()
  },

  goDetail(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    wx.navigateTo({ url: `/pages/checkin-detail/index?date=${date}` })
  },
})
