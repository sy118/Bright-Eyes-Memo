const { addDays, daysUntil, formatDisplayDate } = require('../../utils/dateHelper')
function getDB() { return wx.cloud.database() }

const CHECKUP_NODES = [
  { label: '术后第1天复查',  daysAfter: 1 },
  { label: '术后第7天复查',  daysAfter: 7 },
  { label: '术后1个月复查',  daysAfter: 30 },
  { label: '术后3个月复查',  daysAfter: 90 },
  { label: '术后半年复查',   daysAfter: 180 },
  { label: '术后1年复查',    daysAfter: 365 },
]

Page({
  data: {
    surgeryDate: '',
    checkups: [],
    showResultModal: false,
    showViewModal: false,
    editingIdx: -1,
    editingCheckup: {},
    viewingCheckup: {},
    resultForm: { vision: '', pressure: '', note: '' },
  },

  scheduleDocId: null,

  async onLoad() {
    await this.loadSchedule()
  },

  async loadSchedule() {
    try {
      const cfgRes = await getDB().collection('userConfig').limit(1).get()
      if (!cfgRes.data[0]) return
      const surgeryDate = cfgRes.data[0].surgeryDate
      this.setData({ surgeryDate })

      const res = await getDB().collection('followupSchedule').limit(1).get()
      let schedule = res.data[0]
      if (!schedule) schedule = await this.createSchedule(surgeryDate)
      this.scheduleDocId = schedule._id
      this.renderSchedule(surgeryDate, schedule.checkups)
    } catch (e) {
      console.error('loadSchedule error', e)
    }
  },

  async createSchedule(surgeryDate) {
    const checkups = CHECKUP_NODES.map(n => ({
      ...n,
      targetDate: addDays(surgeryDate, n.daysAfter),
      done: false,
      result: {},
    }))
    const res = await getDB().collection('followupSchedule').add({ data: { checkups } })
    return { _id: res._id, checkups }
  },

  renderSchedule(surgeryDate, checkups) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const rendered = checkups.map(c => {
      const target = new Date(c.targetDate)
      target.setHours(0, 0, 0, 0)
      const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24))
      return {
        ...c,
        targetDate: formatDisplayDate(c.targetDate) + `（${c.targetDate}）`,
        daysLeft: diff,
        isToday: diff === 0,
        isPast: diff < 0 && !c.done,
        isUrgent: diff > 0 && diff <= 3,
      }
    })
    this.setData({ checkups: rendered })
  },

  markDone(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({
      showResultModal: true,
      editingIdx: idx,
      editingCheckup: this.data.checkups[idx],
      resultForm: { vision: '', pressure: '', note: '' },
    })
  },

  onResultInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`resultForm.${field}`]: e.detail.value })
  },

  async saveResult() {
    const { editingIdx, resultForm } = this.data
    const checkups = this.data.checkups.map((c, i) =>
      i === editingIdx ? { ...c, done: true, result: resultForm } : c
    )
    try {
      await getDB().collection('followupSchedule').doc(this.scheduleDocId).update({
        data: { checkups: checkups.map(c => ({
          label: c.label, daysAfter: c.daysAfter,
          targetDate: c.targetDate.split('（')[1]?.replace('）', '') || c.targetDate,
          done: c.done, result: c.result || {},
        }))}
      })
      this.setData({ checkups, showResultModal: false })
      wx.showToast({ title: '复查记录已保存 ✅', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  viewResult(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({ showViewModal: true, viewingCheckup: this.data.checkups[idx] })
  },

  closeModal() { this.setData({ showResultModal: false }) },
  closeViewModal() { this.setData({ showViewModal: false }) },
  noop() {},
})
