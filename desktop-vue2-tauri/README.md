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
- 博客构建/SFTP、自动更新、PicGo、通用附件上传、系统钥匙串里的 AI 密钥、微应用的原生 SFC 编译 IPC 仍需适配。现有应用可继续使用 Electron 版的这些功能。
