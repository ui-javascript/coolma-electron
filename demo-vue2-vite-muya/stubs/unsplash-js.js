// Stub for `unsplash-js` (Muya 的 ImageSelector 用，demo 不实际选图)
// Memo: import Unsplash, { toJson } from 'unsplash-js'
class StubUnsplash {
  constructor () {}
}
const ProxyUnsplash = new Proxy(StubUnsplash, {
  get (target, prop) {
    if (prop === 'default') return StubUnsplash
    if (prop in target) return target[prop]
    return function () { return Promise.resolve({ response: { results: [] }, json: async () => ({}) }) }
  }
})
export default ProxyUnsplash
export const toJson = async () => ({})