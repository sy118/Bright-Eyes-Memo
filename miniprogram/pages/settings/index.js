const { ALL_MEDICINES, getCurrentPhase } = require('../../utils/medicinePhase')
const { getDaysSinceSurgery } = require('../../utils/medicinePhase')
const { validateAllTimes, validateCyclosporine, generateGlobalSchedule } = require('../../utils/timeValidator')

function getDB() { return wx.cloud.database() }

Page({
  data: {
    reminderEnabled: true,
    medicines: [],
    timeError: '',
  },

  surgeryDate: '',
  openid: '',

  async onLoad() {
    await this.loadConfig()
  },

  async loadConfig() {
    try {
      const openid = await getApp().getOpenId()
      if (!openid) return
      this.openid = openid
      const res = await getDB().collection('userConfig').doc(openid).get()
      const cfg = res.data
      this.surgeryDate = cfg.surgeryDate
      const schedule = cfg.reminderSchedule || {}
      const defaultSchedule = generateGlobalSchedule(ALL_MEDICINES)

      // 获取当前阶段实际频次，用于显示"本周X次"
      const phase = getCurrentPhase(cfg.surgeryDate)
      const currentFreqMap = {}
      if (phase) {
        phase.medicines.forEach(m => { currentFreqMap[m.name] = m.frequency })
      }

      const medicines = ALL_MEDICINES.map(m => ({
        ...m,
        times: schedule[m.name] || defaultSchedule[m.name] || [],
        currentFreq: currentFreqMap[m.name] || null, // 当前阶段实际频次
      }))
      this.setData({ reminderEnabled: cfg.reminderEnabled !== false, medicines })
    } catch (e) {
      console.error('loadConfig error', e)
    }
  },

  onToggleReminder(e) {
    this.setData({ reminderEnabled: e.detail.value })
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
      return { ...m, times }
    })
    this.setData({ medicines, timeError: '' })
  },

  async saveSettings() {
    const { medicines, reminderEnabled } = this.data
    const phase = getCurrentPhase(this.surgeryDate)
    const activeNames = phase ? phase.medicines.map(m => m.name) : medicines.map(m => m.name)
    const activeMeds = medicines.filter(m => activeNames.includes(m.name))

    const cyclo = activeMeds.find(m => m.name === '环孢素')
    if (cyclo) {
      const cycloCheck = validateCyclosporine(cyclo.times)
      if (!cycloCheck.valid) { this.setData({ timeError: cycloCheck.message }); return }
    }
    const activeSchedule = {}
    activeMeds.forEach(m => { activeSchedule[m.name] = m.times })
    const check = validateAllTimes(activeSchedule)
    if (!check.valid) { this.setData({ timeError: check.message }); return }

    try {
      const fullSchedule = {}
      medicines.forEach(m => { fullSchedule[m.name] = m.times })
      await getDB().collection('userConfig').doc(this.openid).update({
        data: { reminderSchedule: fullSchedule, reminderEnabled }
      })
      // 同步更新缓存
      const app = getApp()
      if (app.globalData.userConfig) {
        app.globalData.userConfig.reminderSchedule = fullSchedule
        app.globalData.userConfig.reminderEnabled = reminderEnabled
        wx.setStorageSync('userConfig', app.globalData.userConfig)
      }
      this.setData({ timeError: '' })
      wx.showToast({ title: '设置已保存 ✅', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },
})
