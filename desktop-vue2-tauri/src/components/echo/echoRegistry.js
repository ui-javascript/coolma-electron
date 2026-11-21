// ============================================================================
// echoRegistry —— echo 名片仓库（id / name 索引 + 渲染派发）
//
// 形态：一张 echo 卡 = { id, name, desc, icon, color, category, anno_source, propsSchema?, ... }
// ============================================================================

import EchoRuntime from './echoRuntime.js'

const norm = (value = '') => String(value || '').trim()

export default class EchoRegistry {
  constructor (echoCards = []) {
    this.runtime = new EchoRuntime({ registry: this })
    this.refresh(echoCards)
  }

  refresh (echoCards = []) {
    this.echoCards = Array.isArray(echoCards) ? echoCards : []
    this.echoIdMap = new Map()
    this.echoMap = this.echoCards.reduce((acc, echo) => {
      const id = norm(echo?.id)
      const name = norm(echo?.name)
      const normalized = { ...echo, id, name, anno_source: echo?.anno_source || echo?.template || '' }
      if (id) this.echoIdMap.set(id, normalized)
      if (name) acc.set(name, normalized)
      return acc
    }, new Map())
    this.runtime.invalidate()
  }

  getAll () { return Array.from(this.echoMap.values()) }

  getById (id = '') { return this.echoIdMap.get(norm(id)) || null }

  getByName (name = '') { return this.echoMap.get(norm(name)) || null }

  has (name = '') { return this.echoMap.has(norm(name)) }

  render (token = {}) {
    const definitionId = String(token?.propsParsed?.definitionId || token?.definitionId || '').trim()
    const matchedEcho = definitionId ? this.getById(definitionId) : this.getByName(token.echoName)
    return this.runtime.render(token, matchedEcho)
  }

  renderToHtml (token = {}) {
    const definitionId = String(token?.propsParsed?.definitionId || token?.definitionId || '').trim()
    const matchedEcho = definitionId ? this.getById(definitionId) : this.getByName(token.echoName)
    return this.runtime.renderToHtml(token, matchedEcho)
  }
}