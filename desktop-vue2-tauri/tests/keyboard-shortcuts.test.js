/* eslint-env jest */
import { SHORTCUTS, findShortcut } from '../src/desktop/shortcutTable'

function keyEvent (key, { ctrl = false, shift = false, alt = false, code } = {}) {
  return { key, code, ctrlKey: ctrl, metaKey: false, shiftKey: shift, altKey: alt }
}

describe('快捷键表对齐 Electron 原版', () => {
  it('表内 accelerator 不重复', () => {
    const set = new Set(SHORTCUTS.map(item => item.acc.toLowerCase()))
    expect(set.size).toBe(SHORTCUTS.length)
  })

  it('编辑类命中并带上原版 type 参数', () => {
    expect(findShortcut(keyEvent('z', { ctrl: true }))).toMatchObject({
      channel: 'edit',
      event: 'undo',
      arg: 'undo'
    })
    expect(findShortcut(keyEvent('Z', { ctrl: true, shift: true }))).toMatchObject({
      event: 'redo'
    })
  })

  it('格式类与段落类分别落表', () => {
    expect(findShortcut(keyEvent('b', { ctrl: true }))).toMatchObject({
      channel: 'format',
      arg: 'strong'
    })
    expect(findShortcut(keyEvent('1', { ctrl: true }))).toMatchObject({
      channel: 'paragraph',
      arg: 'heading 1'
    })
    expect(findShortcut(keyEvent('=', { ctrl: true }))).toMatchObject({
      arg: 'upgrade heading'
    })
    expect(findShortcut(keyEvent('-', { ctrl: true }))).toMatchObject({
      arg: 'degrade heading'
    })
  })

  it('修饰键严格匹配，不误伤未注册组合', () => {
    expect(findShortcut(keyEvent('b', { ctrl: true, shift: true }))).toBeNull()
    // Ctrl+Shift+D 在原版是「删除段落」，只有纯 Ctrl+D 才是删除线
    expect(findShortcut(keyEvent('d', { ctrl: true, shift: true }))).toMatchObject({
      event: 'deleteParagraph'
    })
    expect(findShortcut(keyEvent('e', { ctrl: true, shift: true }))).toBeNull()
    expect(findShortcut(keyEvent('s', { ctrl: true }))).toMatchObject({
      channel: 'note',
      event: 'save',
      arg: true
    })
    expect(findShortcut(keyEvent('s', { ctrl: true, shift: true }))).toBeNull()
  })

  it('视图类短组合键按物理键位命中（Shift 会把 key 变成 < / >）', () => {
    // 真机 Ctrl+Shift+, 报的是 key '<'、code 'Comma'，只按 key 比对会永远失配。
    expect(findShortcut(keyEvent('<', { ctrl: true, shift: true, code: 'Comma' }))).toMatchObject({
      channel: 'view',
      event: 'switchView'
    })
    expect(findShortcut(keyEvent('>', { ctrl: true, shift: true, code: 'Period' }))).toMatchObject({
      event: 'sourceMode'
    })
    // 不带 code 的合成事件仍按 key 兼容
    expect(findShortcut(keyEvent(',', { ctrl: true, shift: true }))).toMatchObject({
      event: 'switchView'
    })
    // 光靠 code 不能把没按 Shift 的组合放进来
    expect(findShortcut(keyEvent('.', { ctrl: true, code: 'Period' }))).toBeNull()
  })

  it('cut/copy/paste 登记为 passive，交给 WebView 原生处理', () => {
    for (const key of ['x', 'c', 'v']) {
      expect(findShortcut(keyEvent(key, { ctrl: true }))).toMatchObject({
        channel: 'native',
        passive: true
      })
    }
    // Ctrl+Shift+C 仍是「复制为 Markdown」，不能被 passive 那条盖掉
    expect(findShortcut(keyEvent('c', { ctrl: true, shift: true }))).toMatchObject({
      event: 'copyAsMarkdown'
    })
  })

  it('view.devtool 与原版同为 CmdOrCtrl+Shift+P', () => {
    expect(findShortcut(keyEvent('p', { ctrl: true, shift: true }))).toMatchObject({
      channel: 'view',
      event: 'devtool'
    })
    expect(findShortcut(keyEvent('p', { ctrl: true }))).toBeNull()
  })
})
