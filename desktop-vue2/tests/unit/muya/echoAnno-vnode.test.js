// ============================================================================
// tests/unit/muya/echoAnno-vnode.test.js
//
// 锁定 echoAnno vnode 输出的关键契约（v2026-07-29 起面向「失焦突变」的修复）：
//   1) 外层 sel 是稳定的，不含 cursor 决定的 className（ag-gray / ag-hide）
//   2) 外层 vnode 带稳定 key（echoNodeId）和 class module 字典，用以让 snabbdom patch 时
//      sameVnode=true 而不重建 outer span DOM
//   3) class module 用 AG_GRAY / AG_HIDE 这两个常量作 key 计算 boolean
//   4) marker 子节点至少有 1 个（span.ag-echo-placeholder-marker 带 key=__marker__）
//   5) 在 isHideSelf=true 的边界下 children 是 []
//
// 背景：
//   cursor 在 / 不在 token 时，className 会在 AG_GRAY ↔ AG_HIDE 切换；
//   如果这两个 class 进 vnode.sel，snabbdom sameVnode 在 sel 比较时会 false，
//   outer span 会被 removeVnode + createElm 整个替换；同时 children 的 position diff
//   会残留旧 DOM 节点，导致 marker 视觉跳跃——这是「失焦时突变」的根因。
// ============================================================================

// snabbdom h() 在 Node 里能跑（无 DOM module 的最小 init）
const { h } = require('snabbdom')

const echoAnnoMod = require('libs-muya/lib/parser/render/renderInlines/echoAnno.js')
const echoAnno = echoAnnoMod.default || echoAnnoMod

const CLASS_OR_ID = require('libs-muya/lib/config/index.js').CLASS_OR_ID

// 模拟 render context —— echoAnno 用 this.getClassName(outerClass, block, token, cursor)
// 真实 production 走 libs-muya/lib/parser/render/index.js 的 getClassName()：
//   return outerClass || (this.checkConflicted(block, token, cursor) ? AG_GRAY : AG_HIDE)
// 这里 fixture 直接根据 cursor 给出 className，省掉 checkConflicted 链路。
const makeContext = (cursorInToken) => ({
  getClassName (outerClass, block, token, cursor) {
    if (outerClass) return outerClass
    return cursor && cursorInToken ? CLASS_OR_ID.AG_GRAY : CLASS_OR_ID.AG_HIDE
  }
})

const baseToken = {
  echoName: '生生不息',
  echoId: 'echo-ssbx',
  definitionId: 'def-ssbx',
  propsParsed: {},
  raw: '@生生不息{}()',
  range: { start: 0, end: 8 }
}

const baseBlock = { name: 'paragraph' }
const baseCursor = { start: 0, end: 0 }

describe('muya/echoAnno vnode 契约（v2026-07-29 「失焦不突变」）', () => {
  test('外层 outer sel 是稳定的（不含 AG_GRAY/AG_HIDE）', () => {
    const ctx = makeContext(true)
    const result = echoAnno.call(ctx, h, baseCursor, baseBlock, baseToken)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
    const outer = result[0]
    expect(outer.sel).toBe(`span.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`)
    expect(outer.sel).not.toMatch(/\bag-gray\b/)
    expect(outer.sel).not.toMatch(/\bag-hide\b/)
  })

  test('外层 outer 带稳定 key = echoNodeId', () => {
    const ctx = makeContext(true)
    const result = echoAnno.call(ctx, h, baseCursor, baseBlock, baseToken)
    const outer = result[0]
    expect(outer.key).toBeDefined()
    expect(typeof outer.key).toBe('string')
    expect(outer.key).toMatch(/^echo-echo-ssbx-/)
  })

  test('外层 outer 用 class module（snabbdom 静态 class 字典）管理 cursor state', () => {
    const ctxGray = makeContext(true)
    const ctxHide = makeContext(false)
    const rGray = echoAnno.call(ctxGray, h, baseCursor, baseBlock, baseToken)
    const rHide = echoAnno.call(ctxHide, h, baseCursor, baseBlock, baseToken)

    const grayClass = rGray[0].data.class
    const hideClass = rHide[0].data.class
    expect(typeof grayClass).toBe('object')
    expect(grayClass[CLASS_OR_ID.AG_GRAY]).toBe(true)
    expect(grayClass[CLASS_OR_ID.AG_HIDE]).toBe(false)

    expect(typeof hideClass).toBe('object')
    expect(hideClass[CLASS_OR_ID.AG_HIDE]).toBe(true)
    expect(hideClass[CLASS_OR_ID.AG_GRAY]).toBe(false)
  })

  test('AG_GRAY 与 AG_HIDE 路径的 outer sel 一致（patch 不会重建 outer）', () => {
    const ctxGray = makeContext(true)
    const ctxHide = makeContext(false)
    const rGray = echoAnno.call(ctxGray, h, baseCursor, baseBlock, baseToken)
    const rHide = echoAnno.call(ctxHide, h, baseCursor, baseBlock, baseToken)

    // vnode.sel 跨 cursor 状态保持稳定 → snabbdom sameVnode 在 patch 时命中
    expect(rGray[0].sel).toBe(rHide[0].sel)
    expect(rGray[0].key).toBe(rHide[0].key)
  })

  test('marker 子节点结构：marker 套 at-span + name-span', () => {
    const ctx = makeContext(true)
    const result = echoAnno.call(ctx, h, baseCursor, baseBlock, baseToken)
    const outerChildren = result[0].children
    expect(Array.isArray(outerChildren)).toBe(true)
    expect(outerChildren.length).toBe(1)

    const marker = outerChildren[0]
    expect(marker.sel).toBe('span.ag-echo-placeholder-marker')
    expect(marker.key).toBe('__marker__')

    const innerChildren = marker.children
    expect(Array.isArray(innerChildren)).toBe(true)
    // 至少有 at + name 两个 span
    expect(innerChildren.length).toBeGreaterThanOrEqual(2)

    const atSpan = innerChildren[0]
    const nameSpan = innerChildren[1]
    expect(atSpan.sel).toBe('span.ag-echo-anno-at')
    expect(nameSpan.sel).toBe('span.ag-echo-anno-name')
  })

  test('isHideSelf=true 时 children 为 []（不渲染 marker）', () => {
    const ctx = makeContext(true)
    const token = {
      ...baseToken,
      propsParsed: { isHideSelf: true }
    }
    const result = echoAnno.call(ctx, h, baseCursor, baseBlock, token)
    expect(result[0].children).toEqual([])
  })

  test('summary 非空时 name 之后有 value-span', () => {
    const ctx = makeContext(true)
    // summary 在 echoAnno 内部从 propsParsed.value 推导
    const token = {
      ...baseToken,
      propsParsed: { value: 'hello world' }
    }
    const result = echoAnno.call(ctx, h, baseCursor, baseBlock, token)
    const marker = result[0].children[0]
    const innerChildren = marker.children
    // at + name + value
    expect(innerChildren.length).toBe(3)
    expect(innerChildren[2].sel).toBe('span.ag-echo-anno-value')
  })

  // === v2026-07-30 起：识别 propsParsed.echoId 字段（rune-style instance id） ===
  describe('echoId 字段识别（v2026-07-30 起）', () => {
    test('propsParsed.echoId 优先于 propsParsed.id（向后兼容）', () => {
      const ctx = makeContext(true)
      const token = {
        ...baseToken,
        echoId: '',
        propsParsed: { echoId: 'uuid-from-markdown', id: 'legacy-id' }
      }
      const result = echoAnno.call(ctx, h, baseCursor, baseBlock, token)
      const outer = result[0]
      expect(outer.data.dataset.echoId).toBe('uuid-from-markdown')
    })

    test('propsParsed.echoId 缺省时回退到 propsParsed.id', () => {
      const ctx = makeContext(true)
      const token = {
        ...baseToken,
        echoId: '',
        propsParsed: { id: 'legacy-only' }
      }
      const result = echoAnno.call(ctx, h, baseCursor, baseBlock, token)
      const outer = result[0]
      expect(outer.data.dataset.echoId).toBe('legacy-only')
    })

    test('token.echoId 仍优先（parser 端已经把 echoId 拷到 token.echoId）', () => {
      const ctx = makeContext(true)
      const token = {
        ...baseToken,
        echoId: 'parser-set-echoId',
        propsParsed: { echoId: 'markdown-echoId', id: 'legacy-id' }
      }
      const result = echoAnno.call(ctx, h, baseCursor, baseBlock, token)
      const outer = result[0]
      expect(outer.data.dataset.echoId).toBe('parser-set-echoId')
    })
  })
})
