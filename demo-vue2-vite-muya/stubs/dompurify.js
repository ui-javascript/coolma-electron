// Stub for `dompurify` (sanitize 入口用)
// Memo: import DOMPurify from 'dompurify'
const Stub = {
  sanitize (html) { return html || '' },
  addHook: () => {},
  removeHook: () => {},
  removeAllHooks: () => {}
}
const Proxy = new Proxy(Stub, {
  get (target, prop) {
    if (prop === 'default') return Stub
    if (prop in target) return target[prop]
    return function () { return '' }
  }
})
export default Proxy