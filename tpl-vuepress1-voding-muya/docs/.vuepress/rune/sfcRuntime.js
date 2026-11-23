// ============================================================================
// Vue2 SFC 符文运行时
//
// 与桌面端 desktop-vue2/src/components/muya/runeSfcRendererFactory.js 同一条
// 管线：vue-template-compiler 拆 SFC → compileToFunctions 编模板 →
// new Function 执行 `export default` 拿 options → Vue.extend 成构造器。
//
// 只做博客端需要的最小子集，并显式收窄边界：
//   - 支持 options API / 纯模板；
//   - <script> 里出现 import、具名 export 时直接拒绝（运行时不装模块系统）；
//   - <style lang="..."> 不编译（没有 less/sass 运行时），只统计告警；
//   - scoped 样式不重写选择器，模板上的 data-v 属性仍注入，避免串样式。
// ============================================================================

import Vue from 'vue'

const ctorCache = new Map()

function hashScopeId (seed) {
  let hash = 0
  const text = String(seed || 'rune')
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i))
    hash |= 0
  }
  return `data-v-${Math.abs(hash).toString(16).slice(0, 8)}`
}

function injectScopedAttribute (template = '', scopeId = '') {
  if (!scopeId || !template) return template
  return String(template).replace(/<([a-zA-Z][^\s/>]*)(\s[^<>]*?)?(\/?\s*)>/g, (match, tagName, attrs = '', tail = '') => {
    if (/^(template|slot)$/i.test(tagName) || attrs.includes(scopeId)) return match
    return `<${tagName}${attrs} ${scopeId}${tail}>`
  })
}

async function loadTemplateCompiler () {
  const mod = await import(/* webpackChunkName: "rune-sfc-compiler" */ 'vue-template-compiler')
  return mod && mod.default ? mod.default : mod
}

function evalScript (scriptContent = '') {
  const source = String(scriptContent || 'export default {}')
  if (/^\s*import\s/m.test(source) || /export\s+(?:const|let|var|function|class|\{)/.test(source)) {
    throw new Error('SFC 含模块语句（import / 具名 export），博客运行时未启用模块系统')
  }
  const sanitized = source.replace(/export\s+default/, 'return ')
  // eslint-disable-next-line no-new-func
  const factory = new Function(sanitized)
  const result = factory()
  return result && typeof result === 'object' ? result : {}
}

function injectStyle (styleId, cssText) {
  if (!styleId || typeof document === 'undefined' || !cssText) return
  let styleEl = document.getElementById(styleId)
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = styleId
    document.head.appendChild(styleEl)
  }
  if (styleEl.textContent !== cssText) styleEl.textContent = cssText
}

/**
 * SFC 源码 → Vue2 组件构造器。
 * 失败时抛出带可读原因的错误，由宿主回落到静态卡片。
 */
export async function createSfcCtor (rune = {}) {
  const source = String(rune.template || '')
  const cacheKey = `${rune.id || rune.name || 'default'}:${source}`
  if (ctorCache.has(cacheKey)) return ctorCache.get(cacheKey)

  const compiler = await loadTemplateCompiler()
  if (!compiler || typeof compiler.parseComponent !== 'function') {
    throw new Error('vue-template-compiler 不可用，无法编译 SFC')
  }

  const parsed = compiler.parseComponent(source)
  const templateCode = (parsed.template && parsed.template.content || '').trim()
  if (!templateCode) throw new Error('SFC 缺少 <template>')

  const options = evalScript(parsed.script && parsed.script.content)
  const scopeId = hashScopeId(rune.id || rune.name)
  const compiled = compiler.compileToFunctions(injectScopedAttribute(templateCode, scopeId))
  if (compiled && Array.isArray(compiled.errors) && compiled.errors.length) {
    const first = compiled.errors[0]
    throw new Error(`SFC 模板编译失败：${typeof first === 'string' ? first : (first && first.msg) || '未知错误'}`)
  }

  options.name = options.name || `RuneSfc${String(rune.name || 'Rune').replace(/[^A-Za-z0-9]/g, '')}`
  options.render = compiled.render
  options.staticRenderFns = compiled.staticRenderFns || []
  options._scopeId = scopeId

  // 样式：只认纯 CSS；less/sass 跳过并留告警，避免把编译错误吞成白屏
  const styleBlocks = Array.isArray(parsed.styles) ? parsed.styles : []
  const cssText = styleBlocks
    .filter(block => block && block.content && !block.lang)
    .map(block => String(block.content))
    .join('\n')
  if (cssText) injectStyle(`rune-style-${scopeId}`, cssText)

  const skippedLangs = styleBlocks.filter(block => block && block.lang).map(block => block.lang)
  if (skippedLangs.length) {
    // eslint-disable-next-line no-console
    console.warn(`[rune-sfc] ${rune.name || rune.id} 跳过样式语言：${skippedLangs.join(', ')}`)
  }

  const ctor = Vue.extend(options)
  ctorCache.set(cacheKey, ctor)
  return ctor
}

export default { createSfcCtor }
