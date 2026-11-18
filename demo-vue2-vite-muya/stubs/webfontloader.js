// Stub for `webfontloader` (sequence-diagram-snap 用，demo 不渲染 flowchart)
// Memo: import WebFont from 'webfontloader'
const Stub = {
  load: () => {},
  loadGoogle: () => {}
}
const Proxy = new Proxy(Stub, {
  get (target, prop) {
    if (prop === 'default') return Stub
    return target[prop]
  }
})
export default Proxy