const { ALL_MEDICINES } = require('../../utils/medicinePhase')
const { getDaysSinceSurgery, getCurrentPhase, getWeekLabel } = require('../../utils/medicinePhase')
const { today } = require('../../utils/dateHelper')
const { validateAllTimes, validateCyclosporine, generateGlobalSchedule } = require('../../utils/timeValidator')

Page({
  data: {
    currentStep: 1,
    surgeryDate: '',
    todayStr: today(),
    dayCount: 0,
    weekLabel: '',
    medicines: [],
    timeError: '',
  },

  async onLoad() {
    // 先检查是否已设置过，是则直接进首页
    const app = getApp()
    // 1. 内存缓存
    if (app.globalData.userConfig) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    // 2. 本地缓存
    const cached = wx.getStorageSync('userConfig')
    if (cached && cached.surgeryDate) {
      app.globalData.userConfig = cached
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    // 3. 查云数据库
    try {
      const openid = await app.getOpenId()
      if (openid) {
        const res = await wx.cloud.database().collection('userConfig').doc(openid).get()
        if (res.data && res.data.surgeryDate) {
          app.globalData.userConfig = res.data
          wx.setStorageSync('userConfig', res.data)
          wx.reLaunch({ url: '/pages/index/index' })
          return
        }
      }
    } catch (e) {
      // 查不到文档是正常情况（未设置过），继续显示引导页
    }
    this.initMedicines()
  },

  initMedicines() {
    const schedule = generateGlobalSchedule(ALL_MEDICINES)
    const medicines = ALL_MEDICINES.map(m => ({ ...m, times: schedule[m.name] || [] }))
    this.setData({ medicines })
  },

  onSurgeryDateChange(e) {
    const surgeryDate = e.detail.value
    const dayCount = getDaysSinceSurgery(surgeryDate)
    const weekLabel = getWeekLabel(dayCount)
    this.setData({ surgeryDate, dayCount, weekLabel })
  },

  smartSchedule() {
    const schedule = generateGlobalSchedule(ALL_MEDICINES)
    const medicines = this.data.medicines.map(m => ({ ...m, times: schedule[m.name] || m.times }))
    this.setData({ medicines, timeError: '' })
    wx.showToast({ title: '排班完成 ✨', icon: 'none' })
  },

  onTimeChange(e) {
    const { med, idx } = e.currentTarget.dataset
    const newTime = e.detail.value
    const medicines = this.data.medicines.map(m => {
      if (m.name !== med) return m
      const times = [...m.times]
      times[idx] = newTime
      // 环孢素自动联动第二个时间
      return { ...m, times }
    })
    this.setData({ medicines, timeError: '' })
  },

  prevStep() {
    this.setData({ currentStep: this.data.currentStep - 1 })
  },

  nextStep() {
    const { currentStep, surgeryDate, medicines } = this.data
    if (currentStep === 1) {
      if (!surgeryDate) return
      this.setData({ currentStep: 2 })
      return
    }
    if (currentStep === 2) {
      const phase = getCurrentPhase(surgeryDate)
      // 只校验当前阶段实际在用的药品
      const activeNames = phase ? phase.medicines.map(m => m.name) : medicines.map(m => m.name)
      const activeMeds = medicines.filter(m => activeNames.includes(m.name))

      // 环孢素只在第3-4周阶段校验
      const cyclo = activeMeds.find(m => m.name === '环孢素')
      if (cyclo) {
        const cycloCheck = validateCyclosporine(cyclo.times)
        if (!cycloCheck.valid) {
          this.setData({ timeError: cycloCheck.message })
          return
        }
      }
      // 只校验当前阶段药品的5分钟间隔
      const schedule = {}
      activeMeds.forEach(m => { schedule[m.name] = m.times })
      const check = validateAllTimes(schedule)
      if (!check.valid) {
        this.setData({ timeError: check.message })
        return
      }
      this.setData({ currentStep: 3, timeError: '' })
    }
  },

  async finishSetup() {
    wx.showLoading({ title: '保存中...' })
    const { surgeryDate, medicines } = this.data
    const schedule = {}
    medicines.forEach(m => { schedule[m.name] = m.times })
    try {
      const openid = await getApp().getOpenId()
      if (!openid) throw new Error('获取用户标识超时，请检查网络后重试')
      const db = wx.cloud.database()
      await db.collection('userConfig').doc(openid).set({
        data: {
          surgeryDate,
          reminderSchedule: schedule,
          reminderEnabled: true,
          updatedAt: new Date().toISOString(),
        }
      })
      // 验证写入成功
      const verify = await db.collection('userConfig').doc(openid).get()
      if (!verify.data || !verify.data.surgeryDate) throw new Error('数据写入验证失败，请重试')
      const config = { _id: openid, surgeryDate, reminderSchedule: schedule, reminderEnabled: true }
      getApp().globalData.userConfig = config
      wx.setStorageSync('userConfig', config)
      wx.hideLoading()
      wx.reLaunch({ url: '/pages/index/index' })
    } catch (e) {
      wx.hideLoading()
      console.error('finishSetup error:', e)
      wx.showModal({
        title: '保存失败',
        content: e.errMsg || e.message || JSON.stringify(e),
        showCancel: false,
      })
    }
  },
})
