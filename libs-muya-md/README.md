# libs-muya-md

Muya Markdown 语法解析插件（markdown-it）。让 VuePress / VitePress 直接渲染 Muya 导出的 `.md`，不用先改写成 Vue 组件。

## 支持的语法

| Muya 源语法 | 输出 |
| --- | --- |
| `@打字机{scope: prev-block}(春风吹又生)` | `<EchoHost name="打字机" attrs="scope: prev-block" prompt="春风吹又生" />` |
| `@生生不息{speed:2}(…)` | `attrs` 同时接受 `key: value` 与 `{"key":value}` 两种写法 |
| `<span data-rune-name="输入框" data-rune-id="r1" data-rune-node-id="n1" data-rune-value="…">` | `<RuneHost name="输入框" value="…" rune-id="r1" node-id="n1" />` |
| `data-rune-definition` | 原样透传成 `definition`，支持导出器内联定义 |

`@` 前面是字母、数字或汉字时不会命中（避免把 `a@b.com` 当成回响）。

## VuePress 1.x

```js
// docs/.vuepress/config.js
const muyaMarkdown = require('libs-muya-md')

module.exports = {
  markdown: {
    extendMarkdown (md) {
      md.use(muyaMarkdown)
    }
  }
}
```

宿主组件在 `enhanceApp.js` 里全局注册：

```js
import RuneHost from './rune/components/RuneHost.vue'
import EchoHost from './rune/components/EchoHost.vue'

export default ({ Vue }) => {
  Vue.component('RuneHost', RuneHost)
  Vue.component('EchoHost', EchoHost)
}
```

## VitePress

```ts
// docs/.vitepress/config.mts
import muyaMarkdown from 'libs-muya-md'

export default defineConfig({
  markdown: {
    config (md) {
      md.use(muyaMarkdown)
    }
  }
})
```

`enhanceApp` 里注册同名组件即可。远端 hel 包建议在 `enhanceApp` 阶段预热，首屏不用等冷启动。

## 自定义组件名

```js
md.use(muyaMarkdown, { echoComponent: 'MuyaEcho', runeComponent: 'MuyaRune' })
// 或
md.use(require('libs-muya-md').createMuyaMarkdown({ echoComponent: 'MuyaEcho' }))
```

## 边界

- 只做语法映射，不执行脚本、不发网络请求。
- 符文宿主根节点要能被安全嵌进段落：推荐 `span` + `display:block`，避免 `<p><div>` 造成 SSR/客户端 hydration 失配。
- GFM、脚注、上下标、数学公式等仍由站点自身的 markdown-it 插件负责。
