const { getDaysSinceSurgery, getCurrentPhase, getWeekLabel } = require('../../utils/medicinePhase')
const { today } = require('../../utils/dateHelper')

const CARE_ITEMS = [
  { key: 'noWater',    label: '防污水入眼', desc: '洗脸洗头注意保护', icon: '💧' },
  { key: 'noSport',   label: '无剧烈运动', desc: '避免跑步游泳等',   icon: '🏃' },
  { key: 'lightDiet', label: '饮食清淡',   desc: '忌辛辣烟酒',       icon: '🥗' },
  { key: 'noOveruse', label: '未过度用眼', desc: '避免长时间看屏幕', icon: '👁️' },
]

// 懒加载 db，确保在 wx.cloud.init 之后调用
function getDB() { return wx.cloud.database() }

Page({
  data: {
    recovered: false,
    dayCount: 0,
    weekLabel: '',
    medicines: [],
    careItems: CARE_ITEMS.map(c => ({ ...c, checked: false })),
    progressPct: 0,
    doneMeds: 0,
    totalMeds: 0,
    doneCareCnt: 0,
    streakDays: 0,
    hasIncomplete: false,
    incompleteCount: 0,
    showCelebration: false,
    totalDays: 0,
    totalRate: 0,
  },

  userConfig: null,
  todayStr: '',
  checkinDocId: null,

  async onLoad() {
    this.todayStr = today()
    await this.loadUserConfig()
  },

  onShow() {
    if (this.userConfig) this.loadTodayCheckin()
  },

  async loadUserConfig() {
    const app = getApp()
    // 内存缓存命中直接用（同一会话内页面切换）
    if (app.globalData.userConfig) {
      this.userConfig = app.globalData.userConfig
      this._applyConfig()
      return
    }
    try {
      const openid = await app.getOpenId()
      if (!openid) {
        // openid 获取失败（网络问题），降级用本地缓存
        const cached = wx.getStorageSync('userConfig')
        if (cached) {
          this.userConfig = cached
          app.globalData.userConfig = cached
          this._applyConfig()
        } else {
          wx.reLaunch({ url: '/pages/onboarding/index' })
        }
        return
      }
      const res = await getDB().collection('userConfig').doc(openid).get()
      // 查到了，正常进入
      this.userConfig = res.data
      app.globalData.userConfig = res.data
      wx.setStorageSync('userConfig', res.data)
      this._applyConfig()
    } catch (e) {
      // doc 不存在（errCode: -1）= 从未设置过，跳引导页
      // 其他网络错误，降级用本地缓存
      if (e.errCode === -1 || (e.message && e.message.includes('not exist'))) {
        wx.reLaunch({ url: '/pages/onboarding/index' })
      } else {
        const cached = wx.getStorageSync('userConfig')
        if (cached) {
          this.userConfig = cached
          app.globalData.userConfig = cached
          this._applyConfig()
        } else {
          wx.reLaunch({ url: '/pages/onboarding/index' })
        }
      }
    }
  },

  _applyConfig() {
    const day = getDaysSinceSurgery(this.userConfig.surgeryDate)
    const weekLabel = getWeekLabel(day)
    if (day > 28) {
      this.setData({ recovered: true, dayCount: day })
      this.loadStats()
      return
    }
    this.setData({ dayCount: day, weekLabel })
    this.loadTodayCheckin()
  },

  async loadTodayCheckin() {
    const phase = getCurrentPhase(this.userConfig.surgeryDate)
    if (!phase) return
    try {
      const res = await getDB().collection('dailyCheckin')
        .where({ date: this.todayStr }).limit(1).get()
      let checkin = res.data[0]
      if (!checkin) checkin = await this.createTodayCheckin(phase)
      this.checkinDocId = checkin._id
      this.renderCheckin(phase, checkin)
    } catch (e) {
      console.error('loadTodayCheckin error', e)
    }
  },

  async createTodayCheckin(phase) {
    const medicines = {}
    phase.medicines.forEach(m => { medicines[m.name] = { target: m.frequency, done: 0 } })
    const careItems = {}
    CARE_ITEMS.forEach(c => { careItems[c.key] = false })
    const doc = { date: this.todayStr, medicines, careItems, noticeRead: false }
    const res = await getDB().collection('dailyCheckin').add({ data: doc })
    return { _id: res._id, ...doc }
  },

  renderCheckin(phase, checkin) {
    const medicines = phase.medicines.map(m => {
      const rec = checkin.medicines[m.name] || { done: 0, target: m.frequency }
      const done = rec.done
      const allDone = done >= m.frequency
      const pct = Math.min(100, Math.round((done / m.frequency) * 100))
      return { ...m, done, frequency: m.frequency, allDone, pct }
    })
    const careItems = CARE_ITEMS.map(c => ({
      ...c, checked: checkin.careItems ? !!checkin.careItems[c.key] : false
    }))
    const doneMeds = medicines.filter(m => m.allDone).length
    const totalMeds = medicines.length
    const doneCareCnt = careItems.filter(c => c.checked).length
    const totalTasks = totalMeds + 4
    const doneTasks = doneMeds + doneCareCnt
    const progressPct = Math.round((doneTasks / totalTasks) * 100)
    const wasComplete = this.data.progressPct === 100
    this.setData({
      medicines, careItems, doneMeds, totalMeds, doneCareCnt, progressPct,
      hasIncomplete: doneTasks < totalTasks,
      incompleteCount: totalTasks - doneTasks,
    })
    this.loadStreak()
    if (!wasComplete && progressPct === 100) this.setData({ showCelebration: true })
  },

  async checkMedicine(e) {
    const name = e.currentTarget.dataset.name
    const med = this.data.medicines.find(m => m.name === name)
    if (!med || med.allDone) return
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    try {
      // 记录次数 + 追加时间戳日志
      const db = getDB()
      await db.collection('dailyCheckin').doc(this.checkinDocId).update({
        data: {
          [`medicines.${name}.done`]: med.done + 1,
          [`medicines.${name}.logs`]: db.command.push(timeStr),
        }
      })
      const phase = getCurrentPhase(this.userConfig.surgeryDate)
      const res = await getDB().collection('dailyCheckin').where({ date: this.todayStr }).limit(1).get()
      if (res.data[0]) this.renderCheckin(phase, res.data[0])
    } catch (e) {
      wx.showToast({ title: '打卡失败，请重试', icon: 'none' })
    }
  },

  async toggleCare(e) {
    const key = e.currentTarget.dataset.key
    const item = this.data.careItems.find(c => c.key === key)
    if (!item) return
    const newVal = !item.checked
    try {
      await getDB().collection('dailyCheckin').doc(this.checkinDocId).update({
        data: { [`careItems.${key}`]: newVal }
      })
      const phase = getCurrentPhase(this.userConfig.surgeryDate)
      const res = await getDB().collection('dailyCheckin').where({ date: this.todayStr }).limit(1).get()
      if (res.data[0]) this.renderCheckin(phase, res.data[0])
    } catch (e) {
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  async loadStreak() {
    try {
      const res = await getDB().collection('dailyCheckin').orderBy('date', 'desc').limit(60).get()
      let streak = 0
      for (const r of res.data) {
        const meds = Object.values(r.medicines || {})
        const care = Object.values(r.careItems || {})
        if (meds.every(m => m.done >= m.target) && care.every(v => v)) streak++
        else break
      }
      this.setData({ streakDays: streak })
    } catch (e) {}
  },

  async loadStats() {
    try {
      const res = await getDB().collection('dailyCheckin').get()
      const total = res.data.length
      const done = res.data.filter(r => Object.values(r.medicines || {}).every(m => m.done >= m.target)).length
      this.setData({ totalDays: total, totalRate: total > 0 ? Math.round(done / total * 100) : 0 })
    } catch (e) {}
  },

  closeCelebration() { this.setData({ showCelebration: false }) },
  goSettings() { wx.navigateTo({ url: '/pages/settings/index' }) },
})
