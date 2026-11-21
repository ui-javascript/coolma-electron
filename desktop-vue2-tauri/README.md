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
- 已对齐的桌面通道（`src/desktop/bridge.js` 统一分发）：目录选择、单篇导出 Markdown/PNG/附件（保存对话框 + 成功提示，Markdown 会把已缓存图片复制到同级 `ExportImage/` 并改写链接）、批量导出 Markdown、导入本地图片（转 data URL 供 WebView 渲染）、主题目录读写与打开、日志目录、PicGo 上传、笔记图片缓存（`get-cache-image` / `save-temp-image` / `save-uploaded-image` / `get-local-file-data`）、自动更新（见下文「更新协议与发布」）。`$q.electron.shell/clipboard` 由 `boot/tauri-desktop.js` 补同形实现，原版调用点无需改动。
- 快捷键：原版依赖 Electron 原生菜单转发 `editor-*` 事件，Tauri 没有原生菜单，改由 `src/desktop/keyboard.js` 在渲染层复刻同一组 accelerator（编辑、格式、段落、笔记、视图），发出完全相同的事件与参数；`Ctrl+C/X/V` 等系统剪切板快捷键仍交给 WebView 原生处理。
- 剪贴板：原版 `src/boot/electron-clipboard.js` 注入同步的 `window.__electronClipboard`，这里由 `src/desktop/clipboard.js` 提供同形接口；写操作走 `navigator.clipboard` 并降级 `execCommand('copy')`，读操作在窗口获得焦点/重新可见时预热缓存，供同步 `readText()` 返回。
- 博客部署：配置读写（`get/save-blog-deploy-config`，存在本地偏好存储，键名与原版 electron-store 的 `blog-deploy-config` 一致）、CI 模板导出（`export-blog-ci`）与真正的构建/SFTP（`start/cancel-blog-deploy`、`sftp-test-connection`、`sftp-upload`）都已可用。构建与上传跑在 Node sidecar 里（`src-tauri/sidecar/`，JSON-RPC over stdio），复用原版主进程的 `blog-deploy-handler` / `sftp-service`，进度与完成事件名和原版一致。打包前先跑 `pnpm run prepare:sidecar`（已串联进 `pnpm build`）：把 Node 放进 `src-tauri/sidecar/node`、把 `fs-extra`/`ssh2` 装进 `sidecar/node_modules`，发布版因此不依赖机器上已有的 Node；博客构建本身仍要系统有 `npm`/`pnpm` 才能安装 vuepress。
- 微应用解析：`vue-sfc:parse` 也走 sidecar（`sfc.parse`），渲染层不引入 `@vue/compiler-sfc`，绕开 webpack 4 会把可选预处理器全部静态拉进来的问题；错误码沿用原版 `VUE_SFC_*`。
- 窗口行为与原版一致：标题栏关闭只隐藏到后台（再次启动由单实例插件拉回前台），二次确认的「退出」才真正结束进程；窗口位置与大小记在应用数据目录的 `window-state.json`，还原时按原版 600×400 下限夹取并校验坐标是否还在屏幕内。
- AI 密钥沿用原版“交给系统保管”的语义：写入时通过 `keyring` crate 存进 Windows 凭据管理器 / macOS Keychain，SQLite 的 `api_key_encrypted` 只留 `keyring:<账号>` 引用，版本号仍是 2，界面的“系统钥匙串”提示不变；Electron 遗留密文无法解密时按原版行为当作未配置。
- 仍需适配：无（自动更新已接入，见下文）。

## 更新协议与发布

更新源就是本仓库的 GitHub Release，协议用 Tauri updater 标准，不再沿用 Electron 的 `latest.yml`。

- 端点（`src-tauri/tauri.conf.json`）：`https://github.com/ui-javascript/coolma-electron/releases/download/tauri-latest/latest.json`。固定用 `tauri-latest` 这个滚动 tag，避免与 Electron 的 `v*` release 抢 `latest`。
- `latest.json` 结构：`{ version, notes, pub_date, platforms: { "windows-x86_64": { signature, url } } }`，`url` 指向同一 release 里的 `*_x64-setup.exe`，`signature` 是该安装包 `.sig` 的内容。
- 验签公钥写在 `tauri.conf.json` 的 `plugins.updater.pubkey`；私钥不入库，本地默认在 `%USERPROFILE%\.tauri\coolma-tauri.key`。
- 发布流程：`.github/workflows/tauri-release.yml` 在 `tauri-v*` tag 或手动触发时构建签名包、生成 `latest.json`、覆盖上传到 `tauri-latest` release。仓库需要配置 `TAURI_SIGNING_PRIVATE_KEY`（私钥文件内容）与可选的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 每次发布必须先把 `src-tauri/tauri.conf.json` 的 `version` 提升（updater 只认比当前安装版本更大的版本号）。
- 本地出签名包：
  ```powershell
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\coolma-tauri.key" -Raw
  pnpm exec tauri build --config src-tauri/tauri.updater.conf.json
  node scripts/make-updater-json.js
  ```
  第二个参数文件只在打包时开启 `createUpdaterArtifacts`，普通 `pnpm run build` 不需要私钥。
