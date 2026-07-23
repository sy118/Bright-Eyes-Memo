const { PHASES } = require('../../utils/medicinePhase')
const { today } = require('../../utils/dateHelper')
function getDB() { return wx.cloud.database() }

Page({
  data: {
    noticeRead: false,
    phases: PHASES.map(p => ({
      ...p,
      hint: p.id === 'week1a' ? '滴药前洗手，开封首滴丢弃，激素类严禁擅自加量'
          : p.id === 'week2'  ? '严格遵医嘱递减，不可自行增减'
          : p.id === 'week3_4'? '环孢素必须间隔12小时，持续稳定，不可擅停'
          : '激素类严禁擅自加量'
    })),
    hygieneItems: [
      '滴眼药水前后彻底洗手，避免手部细菌污染眼部',
      '术后1个月内洗脸洗头时，避免污水进入眼睛',
      '不要用手揉眼睛，避免外力碰撞眼部',
      '外出时建议佩戴防护眼镜，防止风沙异物入眼',
      '眼药水开封后注意保存条件，避免污染瓶口',
    ],
    sportItems: [
      { period: '术后1周内', rule: '禁止一切运动，以卧床休息为主，避免低头弯腰' },
      { period: '术后1个月内', rule: '禁止游泳、跑步、球类等剧烈运动；禁止夜间驾车' },
      { period: '术后3个月内', rule: '避免对抗性运动和眼部受力活动，可进行轻度散步' },
      { period: '术后3个月后', rule: '可逐步恢复正常运动，但仍需避免眼部直接受力' },
    ],
    normalReactions: [
      '结膜出血（白眼球红色斑块）：属正常现象，2-3周内自行吸收',
      '眩光、光晕：夜间看灯光有光圈，术后数月内逐渐改善',
      '干眼感、异物感：术后常见，坚持使用人工泪液可缓解',
      '视力波动：术后早期视力可能有轻微波动，属正常恢复过程',
      '轻微畏光：术后数天内对强光敏感，可佩戴墨镜缓解',
    ],
    tabooItems: [
      '术后1个月内禁止化眼妆，避免化妆品进入眼睛',
      '禁止长时间连续用眼，每用眼40分钟休息10分钟',
      '禁止在强光或暗光环境下长时间阅读',
      '禁止饮酒、吸烟，忌辛辣刺激性食物',
      '保证充足睡眠，避免熬夜，保持规律作息',
      '禁止自行停药或更改用药频次',
    ],
    emergencyItems: [
      '视力突然明显下降或丧失',
      '眼部剧烈疼痛，止痛药无法缓解',
      '眼压异常升高（头痛、恶心、呕吐）',
      '大量分泌物、眼睛严重充血',
      '看到闪光感或大量飞蚊突然增多',
      '眼前出现黑影遮挡',
    ],
  },

  checkinDocId: null,

  async onLoad() {
    await this.loadNoticeStatus()
  },

  async loadNoticeStatus() {
    try {
      const res = await getDB().collection('dailyCheckin')
        .where({ date: today() }).limit(1).get()
      if (res.data[0]) {
        this.checkinDocId = res.data[0]._id
        this.setData({ noticeRead: !!res.data[0].noticeRead })
      }
    } catch (e) {}
  },

  async toggleNoticeRead() {
    if (!this.checkinDocId) return
    const newVal = !this.data.noticeRead
    try {
      await getDB().collection('dailyCheckin').doc(this.checkinDocId).update({
        data: { noticeRead: newVal }
      })
      this.setData({ noticeRead: newVal })
      if (newVal) wx.showToast({ title: '已记录 ✅', icon: 'none' })
    } catch (e) {}
  },
})
