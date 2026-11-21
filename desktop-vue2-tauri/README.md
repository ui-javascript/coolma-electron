# Coolma Tauri（Vue 2）

这是从 `desktop-vue2` 派生的桌面应用。原项目仍由 Electron 打包；这个包使用 Tauri 2，保留 Vue 2.7、Vue Router 3、Vuex 3、Vue I18n 8、Quasar 1、Webpack 4 和原有编辑器、组件库及依赖版本。根 pnpm workspace 自动纳入该包。

在仓库根目录执行：

~~~sh
pnpm install --frozen-lockfile
pnpm --filter desktop-vue2-tauri run dev
pnpm --filter desktop-vue2-tauri run build
pnpm --filter desktop-vue2-tauri run test
~~~

桌面开发和打包需要 Rust 及 Tauri 平台工具链；Windows 使用 MSVC、Windows SDK 和 WebView2，安装包目标为 NSIS。只检查 Quasar 前端可运行 `pnpm --filter desktop-vue2-tauri run build:frontend`，产物位于 `dist/spa`。Tauri 开发时使用 `http://127.0.0.1:1420`，打包时直接嵌入该 SPA。保留 hash 路由，Monaco workers 和 SQLite WASM 都由 Webpack 打入前端产物。

Windows 安装包默认生成在 `src-tauri/target/release/bundle/nsis/`。如果从工作区运行已构建的 `coolma-tauri.exe` 时遇到 WebView2 初始化失败，可先把可执行文件复制到本机用户目录，再从那里启动以检查是否与路径权限有关。

- 笔记、分类、标签和运行时设置继续使用原版 SQLite 数据模型。Tauri 版的 `memocast.db` 写入应用自己的本地数据目录（标识 `cn.coolma.tauri`），开发构建使用其中的 `dev` 子目录。浏览器预览使用自己的 IndexedDB。不会自动导入或写入 Electron 原版的数据库。
- 窗口控制、标题栏拖动和右键菜单走 Tauri；基础文件导出走 WebView 下载。为知笔记接口和图片上传通过 Tauri 原生网络发送，已有笔记的内嵌图片和附件按需下载并缓存。登录时可启用「自建服务器」并填入完整服务地址；推荐使用 HTTPS。上述资源流程已用本地模拟服务验证，真实账号同步仍需验证。
- 已对齐的桌面通道（`src/desktop/bridge.js` 统一分发）：目录选择、单篇导出 Markdown/PNG/附件（保存对话框 + 成功提示，Markdown 会把已缓存图片复制到同级 `ExportImage/` 并改写链接）、批量导出 Markdown、导入本地图片（转 data URL 供 WebView 渲染）、主题目录读写与打开、日志目录、PicGo 上传、笔记图片缓存（`get-cache-image` / `save-temp-image` / `save-uploaded-image` / `get-local-file-data`）。`$q.electron.shell/clipboard` 由 `boot/tauri-desktop.js` 补同形实现，原版调用点无需改动。检查更新在 Tauri 下会明确提示「暂未接入自动更新」，不再无限转圈。
- 快捷键：原版依赖 Electron 原生菜单转发 `editor-*` 事件，Tauri 没有原生菜单，改由 `src/desktop/keyboard.js` 在渲染层复刻同一组 accelerator（编辑、格式、段落、笔记、视图），发出完全相同的事件与参数；`Ctrl+C/X/V` 等系统剪切板快捷键仍交给 WebView 原生处理。
- 剪贴板：原版 `src/boot/electron-clipboard.js` 注入同步的 `window.__electronClipboard`，这里由 `src/desktop/clipboard.js` 提供同形接口；写操作走 `navigator.clipboard` 并降级 `execCommand('copy')`，读操作在窗口获得焦点/重新可见时预热缓存，供同步 `readText()` 返回。
- 博客部署：配置读写（`get/save-blog-deploy-config`，存在本地偏好存储，键名与原版 electron-store 的 `blog-deploy-config` 一致）与 CI 模板导出（`export-blog-ci`，写到 `<博客目录>/.github/workflows/`，已存在文件跳过）已可用；真正跑 `vuepress build`、GitHub 触发与 SFTP 上传仍缺 Node 运行时，会返回明确的不支持提示。
- 仍需适配：博客构建/SFTP（需要 Node 运行时或 sidecar 才能跑 `vuepress build`），自动更新（Tauri updater 需要签名与发布端点），系统钥匙串里的 AI 密钥，微应用 `vue-sfc:parse`（`@vue/compiler-sfc` 会静态引入大量可选预处理器，需要单独打包并屏蔽这些依赖，不能直接进主 bundle）。现有应用可继续使用 Electron 版的这些功能。
