// Stub for `turndown` (HTML → Markdown，ExportHtml 用，demo 不调)
// Memo: import TurndownService from 'turndown'
class StubTurndownService {
  constructor () {}
  turndown (html) { return html || '' }
  use () { return this }
  remove () { return this }
}
const Proxy = new Proxy(StubTurndownService, {
  get (target, prop) {
    if (prop === 'default') return StubTurndownService
    return target[prop]
  }
})
export default Proxy
export const TurndownService = StubTurndownService