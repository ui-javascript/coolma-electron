# Vue2 依赖复用清单（批次 A）

> 目标：不重写能用同一套实现的纯 JS / Node 能力；框架强绑定的依赖按 Vue3 对应版本替换。
> 原则：能直接复用就复用，不能复用就明确换哪个，不把 Vue2 专用包硬塞进新架子。

## 1. 已经天然复用的依赖

这些在 v2 和 v3 都存在，继续共用同一版本语义：

| 依赖 | v2 | v3 | 说明 |
|---|---|---|---|
| enum-plus | `^3.2.1` | `^3.4.0` | 枚举核心，v3 早已接入 |
| echarts | `^6.0.0` | `^6.1.0` | 图表 |
| hel-micro | `^4.15.3` | `4.15.3` | 微前端 |
| jquery | `3` | `^3.7.1` | Echo/Rune 运行时依赖 |
| markdown-it | `^12.3.2` | `12.3.2` | Markdown 渲染 |
| markmap-lib / markmap-view | `^0.11.6 / ^0.2.6` | 同版本 | 思维导图 |
| monaco-editor | `0.38.0` | `0.38.0` | 源码编辑器 |
| prismjs | `^1.29.0` | `^1.30.0` | 代码高亮 |
| remark / remark-pangu | `13 / 2.2.0` | 同版本 | 文本处理 |
| reveal.js | `4.6.1` | `4.6.1` | PPT 预览 |
| html2canvas | `^1.0.0-rc.7` | `^1.4.1` | 截图 |
| vue-layerx | `1.2.1` | `1.2.5` | 弹层 |

`libs-muya-vue3` 已经带上了 mermaid、katex、vega、flowchart、turndown、uuid、dompurify 等编辑器渲染依赖，因此这些不在 frontend 里重复安装；只有 frontend 直接 `import` 时才需要显式声明。

## 2. 批次 A 新装的通用依赖

### 2.1 前端（浏览器安全）

| 依赖 | 版本 | 用途 / 对应 v2 |
|---|---|---|
| lodash | `^4.18.1` | treeUtil、markdownUtil、store actions 等 12 处 |
| uuid | `^9.0.1` | Muya / Echo 表单生成 id |
| axios | `^1.20.0` | 云函数、请求封装 |
| moment | `^2.31.0` | 日历日期基准、Ant 日期适配 |
| pretty-bytes | `^5.6.0` | 更新包体积 |
| dompurify | `^3.4.18` | HTML 清洗；v2 已依赖 |
| crypto-js | `^4.2.0` | 哈希 / 加密工具 |
| consola | `^3.4.2` | debugLogger |
| cheerio | `^1.2.0` | HTML 解析 |
| sanitize-filename | `^1.6.5` | 导出文件名清洗 |
| strip-ansi | `^6.0.1` | 终端文本清洗 |
| portkey-ai | `^3.1.0` | AI 网关 SDK |
| element-resize-detector | `^1.2.4` | 容器尺寸监听 |
| fitty | `^2.4.2` | 标题自适应字号 |

### 2.2 Electron 主进程（Node）

| 依赖 | 版本 | 用途 |
|---|---|---|
| fs-extra | `^11.4.1` | 博客部署、文件复制 |
| node-schedule | `^2.1.2` | 定时任务 |

Node 专用依赖放在 `desktop-vue3/package.json`，不放 frontend，避免被 Vite 打进浏览器 bundle。

## 3. 已经完成的枚举复用

v3 原来不是没有 enum-plus，而是只搬了少数枚举。本次把 v2 的入口类枚举接回：

- `AiAssistantProviderEnum`：`builtin` / `doubao`，带 label、icon、tooltip、tagType。
- `CloudSyncProviderEnum`：`wiznote` / `customFn`，带 label、icon、tagType。
- 顶栏 AI 入口改为枚举比较，不再散落 `'doubao'` 字符串。
- 设置页云同步方式改为遍历 `CloudSyncProviderEnum.items`，不再手写两个 radio。

后续按同样方式继续搬：`SettingsTabEnum`、`RuneEchoCategoriesEnum` 等，等对应页面开始重构时再接，不提前造无用常量。

## 4. 不能直接复用、必须换 Vue3 版本的

| v2 依赖 | v3 对应 | 原因 |
|---|---|---|
| quasar 1 | quasar 2 | 组件 API / CSS 变量不同 |
| ant-design-vue 1.7 | ant-design-vue 4 | slot、Calendar、ConfigProvider 不同 |
| element-ui 2.15 | element-plus 2.14 | 组件前缀、CSS 变量不同 |
| vuex 3 | pinia | 状态架构不同 |
| vue-router 3 | vue-router 4 | 路由 API 不同 |
| vue-i18n 8 | vue-i18n 11 | legacy / composition API 不同 |
| wujie-vue2 | wujie-vue3 | Vue 运行时绑定不同 |
| vuedraggable 2 | vuedraggable 4 | Vue2 / Vue3 组件实现不同 |
| vue-clamp | 待选 Vue3 替代 | Vue2 指令/组件 |
| vue-element-ui-x | vue-element-plus-x | Vue2 / Vue3 绑定不同 |
| libs-muya-vue2 | libs-muya-vue3 | 编辑器 Vue 包装层不同 |
| @melt-js/libs-core-vue2 | libs-echo-core / libs-rune-core | 已拆成 Vue 无关纯逻辑 |

## 5. 暂不安装的

- `webpack` / `@quasar/app` / `vue-template-compiler`：v2 构建链，v3 用 Vite。
- `electron` / `electron-updater` 旧版：v3 已有 Electron 39 与 electron-updater 6。
- `@form-create/ant-design-vue`、`@form-create/element-ui`：v2 是 Vue2 版本；等 Echo 表单真的开始复刻时再装 Vue3 对应版本，避免先装错。
- `mermaid`、`katex`、`vega` 等：已由 `libs-muya-vue3` 传递依赖提供，frontend 直接 import 时再显式加。

## 6. 安装纪律

1. 浏览器能跑的进 `desktop-vue3/frontend`；碰 `fs`、子进程、系统调度的进 `desktop-vue3` 根。
2. 不因为“v2 有”就无脑装；先看 v3 是否已通过 workspace 库传递提供。
3. 框架专用包不跨大版本硬复用，按对应 Vue3 包替换。
4. 并行 agent 环境下，依赖改动和 lockfile 要单独提交，避免和业务改动混在一起被重置。
