---
title: 符文 / 回响运行时
---
# 符文 / 回响运行时（VitePress / Vue3）

和 VuePress 版本同一套 Markdown 写法，宿主换成 VitePress + Vue 3.5，符文渲染器换成 `libs-muya-rune-vue3`，回响共用 `libs-echo-runtime`。

| 层 | VuePress 1.x | 本页（VitePress 1.x） |
|---|---|---|
| 宿主 Vue | 2.7.16 | 3.5 |
| SFC 编译 | `vue-template-compiler` | `@vue/compiler-dom` |
| 远端加载 | `@melt-js/libs-core-vue2` | `@melt-js/libs-core-vue3` |
| 远端包 | `comps-vue2` | `comps-vue3` |
| 回响运行时 | `libs-echo-runtime` | `libs-echo-runtime` |

## 1. 本地 SFC 符文

`createRuneRendererCtor` 编译模板后 `createApp` 挂到一个容器里，宿主只负责挂载 / 卸载 / 传值。输入可以直接改。

<RuneHost name="输入框" value="Vue3 宿主下输入，值回写" rune-id="vt-input-1" node-id="vt-node-1" />

## 2. 带继承语义的 SFC 符文

<RuneHost name="演示符文" value="来自上一行的文本" rune-id="vt-demo-1" node-id="vt-node-2" />

## 3. hel-micro 远程 Vue3 组件

```json
{
  "$type": "melt-js",
  "dep": {
    "name": "comps-vue3",
    "type": "custom",
    "host": "https://cdn.jsdelivr.net/gh/melt-js/comps-vue3@master/hel_dist/hel-meta.json"
  },
  "exportName": "HelloWorld"
}
```

产物是 Vue3 组件，加载和渲染都在客户端 `mounted` 之后；构建期不请求网络。

<RuneHost name="melt-hello-vue3" rune-id="vt-melt-1" node-id="vt-node-3" />

## 4. 回响运行时：打字机

回响不执行 `anno_source` 里的 JS，只读 `field` 元信息走内置渲染器。打字机取标记的上一个块，量宽高、隐藏占位撑布局，再逐字写入。

上一段文字会被逐字展开，标记单独占一段。

<EchoHost name="打字机" attrs="speed: 45" prompt="逐字展开" />

## 5. 回响运行时：弹幕飘过

弹幕克隆上一个块，固定定位从右向左飘，`animationend` 自动移除，原段落保留。

上一段文字会被克隆成一条弹幕，从屏幕右侧飘到左侧，原段落仍然保留。

<EchoHost name="弹幕飘过" attrs="speed: 7, scope: prev-block" />

## 6. 回响运行时：生生不息

`scope: siblings` 扫描标记所在块的兄弟元素，`target` 用 CSS 选择器收窄。下面三张卡片会按 0 / 120 / 240ms 错峰脉冲，标记本身也会亮起绿色描边。

<div class="growth-demo" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0">
<div class="growth-card" style="padding:14px;border:1px solid var(--vp-c-border, var(--border-color, #e5e7eb));border-radius:10px;background:var(--vp-c-bg-soft, var(--bg-color, #f8fafc))"><b style="color:#43A047">春</b><br>种子破土</div>
<div class="growth-card" style="padding:14px;border:1px solid var(--vp-c-border, var(--border-color, #e5e7eb));border-radius:10px;background:var(--vp-c-bg-soft, var(--bg-color, #f8fafc))"><b style="color:#43A047">夏</b><br>枝叶舒展</div>
<div class="growth-card" style="padding:14px;border:1px solid var(--vp-c-border, var(--border-color, #e5e7eb));border-radius:10px;background:var(--vp-c-bg-soft, var(--bg-color, #f8fafc))"><b style="color:#43A047">秋</b><br>生生不息</div>
</div>

<EchoHost name="生生不息" attrs="scope: siblings, trigger: auto, target: .growth-card" prompt="春风吹又生" />

## 7. 导出器内联定义（组件模式）

导出器在组件模式下把符文定义以 base64 塞进 `definition`，把回响的 `field` 直接塞进 `field`。下面两条不依赖目录，只靠标签属性挂载：

<RuneHost name="内联示例" value="来自导出器" rune-id="inline-1" node-id="inline-n1" definition="eyJpZCI6ImlubGluZS1ydW5lIiwibmFtZSI6IuWGheiBlOekuuS+iyIsImRlc2MiOiLnlLHlr7zlh7rlmajlhoXogZTnmoQgU0ZDIiwiY29sb3IiOiIjN0U1N0MyIiwiaWNvbiI6IuKcpiIsInRlbXBsYXRlIjoiPHRlbXBsYXRlPjxkaXYgY2xhc3M9XCJpbmxpbmUtcnVuZS1kZW1vXCI+5YaF6IGU56ym5paH77yae3sgdmFsdWUgfX08L2Rpdj48L3RlbXBsYXRlPlxuPHNjcmlwdD5cbmV4cG9ydCBkZWZhdWx0IHsgcHJvcHM6IHsgdmFsdWU6IHsgdHlwZTogU3RyaW5nLCBkZWZhdWx0OiAnJyB9IH0gfVxuPC9zY3JpcHQ+IiwiY2F0ZWdvcnkiOiJkZW1vIiwiaW5oZXJpdEZyb21QcmV2aW91cyI6MH0=" />

上一段文字由导出器内联，回响没有走目录，只靠 `field` 执行。

<EchoHost name="内联打字机" attrs="speed: 40" field="typewriter" />

## 8. 和 VuePress 版的关系

同一份导出产物可以同时喂给两个模板：

- VuePress 1.x：`RuneHost` 里用 `vue-template-compiler` + `libs-core-vue2`；
- VitePress：`RuneHost` 里用 `libs-muya-rune-vue3` + `libs-core-vue3`；
- 回响：两边都用 `libs-echo-runtime`，纯 DOM，不依赖框架版本。

导出器的「真组件」模式会把符文定义以 base64 `definition` 内联、把回响 `field` 内联，所以博客不需要预先持有用户目录；主题只要注册过宿主组件就能挂载。Markdown 里只写 `<RuneHost name="…" value="…" />` 和 `<EchoHost name="…" attrs="…" />`，宿主版本决定用哪条运行时。
