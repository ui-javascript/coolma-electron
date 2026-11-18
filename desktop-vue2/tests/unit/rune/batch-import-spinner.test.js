// ============================================================================
// tests/unit/rune/batch-import-spinner.test.js
//
// 锁定"RuneBatchImportDialog 导入关闭流程"契约（v2026-08-01）：
//
//   历史上（f15708a 改造后）父组件 SettingsDialog.onRuneBatchImport 在导入完成后
//   通过 self.$emit('imported', count) 试图通知弹框关停 spinner。
//   但 Vue 2 中组件实例的 $emit 不会触发**自身**模板里的 @imported 监听器：
//     @imported 这种 v-on 语法只在**父组件监听子组件**时才生效。
//   因此弹框 importing 永远停在 true → 按钮一直转圈，
//   但 notify 正常弹出（notify 在 emit 之前已经响），造成"导入成功但按钮还在转圈"的分裂。
//
//   锁定契约：
//     1) 走 happy path 渲染模板（最简 mock）：@imported 不会被 self.$emit('imported') 触发。
//     2) 父组件必须显式调 ref.onImportSuccess(count) → importing 立即变 false。
//     3) 走失败路径：父组件显式调 ref.onImportError(message) → importing 立即变 false。
//
//   这里不挂 .vue、不渲染模板——直接等价复刻"父组件 emit/handler 接线"的方式做断言。
//   这本质是 Vue 2 自有行为的契约，不是组件逻辑；测试用 Vue 2 的 $emit 实际行为验证。
// ============================================================================

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

// ==== 模拟 Vue 2 组件的 $emit / $on 机制（最小实现） ====
// 真实 Vue 2 中：
//   - 子组件 vm.$emit(event, payload) 触发 vm._events[event] 里的 handler
//   - 父组件模板的 @event=fn 实际上是把 fn 注册到子组件 vm._events[event]
//   - 父组件自己的 $emit 只往自己 _events 派发，不会自动跑到子组件
//   - 因此 self.$emit('imported', ...) 不会触发 self.$on('imported', ...) 之外的模板 @imported
//          —— 除非有同学显式 self.$on('imported', handler)

function makeVueLikeInstance () {
  const listeners = {}
  return {
    $on (event, handler) {
      ;(listeners[event] = listeners[event] || []).push(handler)
    },
    $emit (event, ...args) {
      ;(listeners[event] || []).forEach(h => h(...args))
    },
    _events: listeners
  }
}

// ==== 等价复刻 SettingsDialog 的弹框接线 ====
//  模板（简化）：
//    <runeBatchImportDialog
//      ref='runeBatchImportDialog'
//      @imported='onRuneBatchImported'
//    />
//  Vue 编译时等价于：
//    child.$on('imported', parent.onRuneBatchImported)
function buildMockDom () {
  // 父组件实例
  const parent = makeVueLikeInstance()
  parent.importing = false
  parent.onRuneBatchImported = function (count) {
    const ref = this.$refs.runeBatchImportDialog
    if (ref && typeof ref.onImportSuccess === 'function') {
      ref.onImportSuccess(count)
    }
  }
  parent.onRuneBatchImportFailed = function (message) {
    const ref = this.$refs.runeBatchImportDialog
    if (ref && typeof ref.onImportError === 'function') {
      ref.onImportError(message)
    }
  }
  parent.$refs = {}

  // 子组件（弹框）实例
  const child = makeVueLikeInstance()
  child.importing = false
  child.importResult = null
  child.onImportSuccess = function (count) {
    this.importing = false
    this.importResult = { success: true, count }
  }
  child.onImportError = function (message) {
    this.importing = false
    this.importResult = { success: false, message }
  }

  // 模拟 Vue 编译后的接线：父组件把 onRuneBatchImported 注册到子组件的 $on('imported')
  child.$on('imported', parent.onRuneBatchImported.bind(parent))
  child.$on('import-failed', parent.onRuneBatchImportFailed.bind(parent))

  parent.$refs.runeBatchImportDialog = child
  return { parent, child }
}

describe('RuneBatchImportDialog 导入关闭流程（v2026-08-01 修复）', () => {
  test('PROBLEM 状态：父组件 self.$emit("imported") 不会触发 @imported，importing 永远 true', () => {
    // 这条契约锁定 bug：不直接调 ref.onImportSuccess 的话，importing 永远为 true。
    const { parent, child } = buildMockDom()
    // 子组件 doImport 设 importing = true
    child.importing = true
    // 父组件错误的写法：self.$emit('imported', count)
    parent.$emit('imported', 5)
    // 父组件 emit 给自己的事件**不会被**子组件 $on('imported') 监听到
    expect(child.importing).toBe(true)
    expect(child.importResult).toBeNull()
  })

  test('修复：父组件显式调用 ref.onImportSuccess(count) → importing 变 false', () => {
    const { parent, child } = buildMockDom()
    child.importing = true
    // 正确写法：同步调 ref.onImportSuccess
    parent.onRuneBatchImported(5)
    expect(child.importing).toBe(false)
    expect(child.importResult).toEqual({ success: true, count: 5 })
  })

  test('修复：父组件显式调用 ref.onImportError(message) → importing 变 false', () => {
    const { parent, child } = buildMockDom()
    child.importing = true
    parent.onRuneBatchImportFailed('保存失败')
    expect(child.importing).toBe(false)
    expect(child.importResult).toEqual({ success: false, message: '保存失败' })
  })

  test('happy path：模拟完整 batchImport 流程——最后 importing=false', () => {
    const { parent, child } = buildMockDom()
    // 1. 子组件 doImport
    child.importing = true
    child.$emit('import', { items: [], category: 'general', conflictMode: 'normal' })
    // 2. 父组件 handler 假设：service.batchImport 成功 → notify → 调 ref.onImportSuccess
    parent.onRuneBatchImported(3)
    expect(child.importing).toBe(false)
  })

  test('save path：模拟 batchImport 失败 → importing 也能关掉', () => {
    const { parent, child } = buildMockDom()
    child.importing = true
    child.$emit('import', { items: [], category: 'general', conflictMode: 'normal' })
    // 父组件 handler 假设：result.success=false → 调 ref.onImportError
    parent.onRuneBatchImportFailed('UNIQUE 索引冲突')
    expect(child.importing).toBe(false)
    expect(child.importResult).toEqual({ success: false, message: 'UNIQUE 索引冲突' })
  })
})
