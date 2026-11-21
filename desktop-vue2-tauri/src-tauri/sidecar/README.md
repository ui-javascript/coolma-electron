# 博客构建 / SFTP sidecar

Tauri 版没有 Node 主进程，博客打包与 SFTP 上传需要真实的 Node 运行时，因此放到一个常驻子进程：

```
渲染层 src/desktop/sidecar.js
  └─ invoke('sidecar_send', { line }) ─→ Rust src-tauri/src/sidecar.rs
        └─ 启动 node → 本目录 node-bridge.js
              ├─ stdin:  { id, method, params }
              ├─ stdout: { type:'result', id, ok, data|error }
              └─ stdout: { type:'event', channel, data }
```

stdout 每行一条 JSON，Rust 把每行转成 `sidecar-line` 事件，前端按 id 配对结果、按 channel 分发事件。构建过程中的 `blog-deploy-progress` / `blog-deploy-done` / `sftp-upload-progress` 就是这么回到 dialog 的。

## 方法

| method | 说明 |
| --- | --- |
| `ping` / `status` | 自检，返回 Node 版本与服务目录 |
| `blog.start` | 等价于原版 `execBlogBuild`：校验目录、写配置、npm 安装、`vuepress build`、CDN 注入、GitHub 触发、SFTP 上传 |
| `blog.cancel` | 杀掉当前构建子进程 |
| `sftp.test` | 测试连接并验证远端可写 |
| `sftp.upload` | 递归上传目录，逐文件发 `sftp-upload-progress` |
| `sftp.cancel` | 断开当前 SFTP 连接 |

## services/ 为什么要内联

`services/` 是 `desktop-vue2/src-electron/main-process/service` 里四个文件的副本（`blog-deploy-handler.js`、`sftp-service.js`、`blog-config-writer.js`、`github-api.js`）。打包后仓库里的 `desktop-vue2` 不在资源目录，所以必须带一份；上游改动后同步：

```powershell
node src-tauri/sidecar/sync-services.js --check   # 比对
node src-tauri/sidecar/sync-services.js           # 复制
```

这几个文件 `require('electron')`，由 `electron-shim.js` 接管：`BrowserWindow.fromWebContents` 返回一个假窗口，其 `webContents.send` 直接把消息写成 stdout 事件。

## 运行时依赖

- `fs-extra`、`ssh2`：发布版由 `scripts/prepare-sidecar.js` 装进本目录的 `node_modules`（`sidecar/package.json` 已声明）；开发时如果没装，Rust 端会把 `desktop-vue2/node_modules` 塞进 `NODE_PATH` 借用。
- Node 本身：按顺序找 `COOLMA_NODE` → 资源目录 `node/node.exe` → 本目录 `node/node.exe`（prepare 脚本复制的）→ 本目录 `node.exe` → PATH 里的 `node`。
- 博客构建还要用系统上的 `npm`/`pnpm`（要装 vuepress 依赖），所以目标机器仍需 Node 环境；sidecar 自带 Node 只是保证桥接脚本一定能跑起来。
- `COOLMA_SERVICE_DIR` 可以覆盖服务目录，便于调试。

## 打包

```powershell
cd desktop-vue2-tauri
pnpm run prepare:sidecar     # 复制 Node 到 src-tauri/sidecar/node，安装 fs-extra + ssh2
pnpm run build               # 已串联 prepare:sidecar，再执行 tauri build
```

`src-tauri/sidecar/node` 与 `sidecar/node_modules` 不入库（见 `.gitignore`），`tauri.conf.json` 的 `sidecar/**` 资源规则会随打包一起收进安装包。

## 自检

```powershell
'{"id":1,"method":"ping"}' | node src-tauri/sidecar/node-bridge.js
```
