# 破万法禁用效果验收（2026-11-22）

## 入口与动作

- 页面：`http://127.0.0.1:5173/#/`，viewport 1123×748。
- 数据：通过 Pinia 注入一篇测试笔记和两张内置回响卡（`破万法`、`生生不息`）。
- Markdown：
  - 对照组 1：`**@破万法{target: "block"}()** 与 **@生生不息{scope: "siblings", trigger: "manual"}()** 在同一段。`
  - 对照组 2：同结构，但 `target: "line"`。
- 两个回响分别放在独立的 `<strong>` 中，从而在当前“一行一个回响 token”的解析规则下，仍能在同一个 `<p>` 里产生两个 `data-echo-inline=true` 宿主。

## 可见结果

| 场景 | 破万法宿主 | 生生不息宿主 |
|---|---|---|
| `target=block` | `ag-rune-shatter-active`，红色 1px 外框 | `data-shatter-disabled=true`、`ag-rune-shatter-disabled`，透明度 0.35、灰度、删除线 |
| `target=line` | `ag-rune-shatter-active` | 无 `data-shatter-disabled`，保持正常 |

真实 DOM 读取（4 个宿主）：

```text
破万法 block: disabled=null, class 含 ag-rune-shatter-active
生生不息     : disabled=true, class 含 ag-rune-shatter-disabled / ag-rune-growth-active
破万法 line : disabled=null, class 含 ag-rune-shatter-active
生生不息     : disabled=null, class 含 ag-rune-growth-active
```

截图：`echo-shatter-20261122.png`。第一段里“生生不息”明显变灰并被划掉，破万法自身红框激活；第二段 `line` 模式只激活破万法，不误伤另一个回响。

## 回归覆盖

`desktop-vue3/scripts/runtime-test.ts` 新增 3 条断言：

1. `破万法 target=block 禁用同块回响`
2. `破万法清理后恢复回响`
3. `破万法 target=line 不跨父节点误伤`

`pnpm --dir desktop-vue3 test:runtime` 全部通过。

## 结论与边界

- 不需要改 parser ABI。此前“一个 block 只能有一个回响”的结论只适用于裸文本 token；用 `<strong>` / `<em>` 等行内容器分隔后，同一 block 可以有多个回响宿主，破万法的 `block` 作用域能真实命中。
- `target=line` 的作用域是回响的直接父节点，与 v2 `echoBuiltinsShatter.js` 的 `$rune.parent()` 一致；两个回响各自在独立 `<strong>` 时不会互相命中，这是 v2 同源行为，不是回归。
- 截图中第二段末尾出现的字面 `**` 是 Markdown 强强调与行内回响 token 交界的既有渲染问题，与破万法禁用逻辑无关；本项未扩大范围去改 Markdown tokenizer。
