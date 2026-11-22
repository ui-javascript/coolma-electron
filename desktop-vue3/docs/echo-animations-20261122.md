# R-03：四张内置回响运行时动画

日期：2026-11-22
基线：`1d0ade9 fix(editor): Rune 尺寸写回不再让卡片退化为源码`
目标：`libs-muya-echo-vue3`、`libs-muya-vue3`、`desktop-vue3/frontend/src/styles`

## 范围校正

计划里的“成长 / 碎裂 / 天空步道 / 双生花”不是 Rune 模板，而是四张内置 **回响（Echo）**：

| 计划叫法 | 实际卡名 | id | 运行时行为 |
| --- | --- | --- | --- |
| 成长 | 生生不息 | `__builtin_growth__` | 给附近目标加 `ag-rune-growth-target`，跑 `ag-rune-growth-pulse 2.6s` 无限脉冲，并按 index 写 0–960ms stagger |
| 碎裂 | 破万法 | `__builtin_shatter__` | 自身加 `ag-rune-shatter-active`；把同段/同块其它回响写 `data-shatter-disabled=true` |
| 天空步道 | 天行健 | `__builtin_skywalk__` | 在文档根写 `data-skywalk-theme` / `data-skywalk-layout`，自身加 `ag-rune-skywalk-active` |
| 双生花 | 双生花 | `__builtin_twinbloom__` | 克隆相邻节点，写 `data-twinbloom-of` 与 `ag-rune-twinbloom-clone` |

## 根因与修复

### 1. 内置卡源码被归一化成空字符串

`EchoRegistry.refresh()` 只读 snake_case `anno_source`，应用侧库卡是 camelCase `annoSource`。结果注册表里 `anno_source` 长度 0，`compileDefinition` 只有 `render` 没有 `afterRender`，`echoRuntime._installed` 为 0，四张卡的动画全部不执行，只剩回退胶囊。

修复：`anno_source` 同时接受 `anno_source`、`annoSource`、`template`。

### 2. 回响宿主被 `ag-hide` 锁成 0 宽

回响宿主带 `ag-hide`（源码折叠态），v2 用后置 `.ag-echo-placeholder-host { display:inline }` 还原。v3 缺这条覆盖，实测宿主 `width:0; height:23–26; overflow:hidden`，胶囊完全不可见。

修复：补 `span.ag-echo-placeholder-host` / `span.ag-echo-inline-host` 的行内覆盖。选择器带 `span` 提高一级 specificity，压过 `.ag-hide`。修复后宿主 `80.32×22.14`，`display:inline`、`overflow:visible`。

### 3. 天行健找不到文档根

内置实现只认 `[data-echo-document], .mu-editor, article, [data-doc-id]`。v3 编辑器 DOM 只有 `div#ag-editor-id` 和 `.libs-muya-host`，四个选择器全不命中，`data-skywalk-theme/layout` 永远写不进去。

修复：给 `libs-muya-vue3/src/MuyaEditor.vue` 的 `.libs-muya-host` 加 `data-echo-document`。

### 4. 破万法激活描边被 contenteditable 重置压掉

v3 的 `[contenteditable]` 重置规则 specificity 高于 `.ag-rune-shatter-active`，`outline: 1px dashed #E53935` 被算成 `outline:none`。补 `box-shadow: 0 0 0 1px #E53935` 作为可见激活态。

## 1123×748 实测

注入四张内置 Echo 卡和一条 `R-03 动画验收` 笔记，真实页面读数：

| 指标 | 结果 |
| --- | --- |
| `[data-echo-host=true]` | 4 |
| `echoRuntime._installed` | 4 |
| 宿主名称 | 生生不息、天行健、破万法、双生花 |
| growth targets | 10 个 `p`，`animationName=ag-rune-growth-pulse` |
| growth stagger | 0ms / 120ms / 240ms / 360ms … |
| growth transform 采样 | `scale 1.01835 → 1.00307 → 0.901547`，`brightness 1.0367 → 0.921768` |
| shatter active | 1，红色 1px 外框可见 |
| shatter disabled | 0 |
| skywalk 根属性 | `data-skywalk-theme=dark`、`data-skywalk-layout=enhanced` |
| skywalk active | 1 |
| twinbloom clone | 1 个 `[data-twinbloom-of]`，含徽标与克隆正文 |
| twinbloom active | 1 |

![R-03 四张内置回响](rune-echo-animations-20261122.png)

生长动画连续 18 帧，6fps，1123×748：

[rune-echo-growth-20261122.mp4](rune-echo-growth-20261122.mp4)

## 未完成边界

1. **破万法的“禁用其它回响”已补验，结论修正。** 裸文本 token 确实一行只能解析一个回响，但把两个回响分别放进独立的 `<strong>` / `<em>` 后，同一个 `<p>` 内可以出现两个 `data-echo-inline=true` 宿主。`target=block` 时“生生不息”被写入 `data-shatter-disabled=true` 并变灰，`target=line` 不误伤，见 [echo-shatter-20261122.md](echo-shatter-20261122.md)。不需要改 parser ABI。
2. **双生花占位文本重复。** 克隆正文是 `🌸 双生花 · 双生节点 + 原文 + 双生节点`。原因是内置实现用 `/🌸.*$/` 判断“无可见文本”，把徽标后的正文也一起截掉，于是又追加一次 placeholder。v2 同源，本次不改内置源码。
3. **天行健只写 CSS 钩子。** `--ag-skywalk-bg/fg` 在 v3/v2 都没有消费方，实际可见的只有 `layout` 的字距/行高与激活外框；主题色不会改正文底色。

## 检查

- `pnpm typecheck` 通过
- `pnpm test:runtime` 通过，新增 `EchoRegistry` camelCase 编译断言、`data-echo-document` 与宿主样式结构断言
- `pnpm build-frontend` 通过
