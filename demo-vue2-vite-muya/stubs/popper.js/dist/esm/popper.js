/**
 * popper.js 空壳：demo 只需要 baseFloat 的定位接口，不引入真实 popper 体积。
 * 真实定位由 CSS + 宿主容器负责，这里提供最小 API：update / destroy / scheduleUpdate。
 */
export default class PopperStub {
  constructor () {
    this.state = { isDestroyed: false }
  }

  update () {}

  scheduleUpdate () {}

  destroy () {
    this.state.isDestroyed = true
  }
}
