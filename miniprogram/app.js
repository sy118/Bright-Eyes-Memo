App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({ env: '你的云环境ID', traceUser: true })
    // 启动时立即获取 openid，存为 promise 供各页面 await
    this._openIdPromise = this._fetchOpenId()
    // 恢复本地缓存
    try {
      const cached = wx.getStorageSync('userConfig')
      if (cached) this.globalData.userConfig = cached
    } catch (e) {}
  },

  async _fetchOpenId() {
    try {
      // 先查本地缓存，避免每次冷启动都调云函数
      const cached = wx.getStorageSync('openid')
      if (cached) {
        this.globalData.openid = cached
        return cached
      }
      // 加超时保护，最多等5秒
      const res = await Promise.race([
        wx.cloud.callFunction({ name: 'getOpenId' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      const openid = res.result.openid
      this.globalData.openid = openid
      wx.setStorageSync('openid', openid)
      return openid
    } catch (e) {
      console.error('fetchOpenId error', e)
      return ''
    }
  },

  // 各页面调用此方法获取 openid，自动等待异步完成
  getOpenId() {
    return this._openIdPromise || Promise.resolve(this.globalData.openid)
  },

  globalData: {
    env: '你的云环境ID',
    userConfig: null,
    openid: '',
  }
})
