---
name: desktop-vue3-package
description: >
  在 Windows 上给 desktop-vue3 打生产包（NSIS 安装包 / 免安装目录），并在打包前后核对产物完整性。
  用于「打包 desktop-vue3」「出安装包」「重打一版」，或排查「打包通过但安装报 uninstallerIcon.ico 不能写入」
  「免安装版双击没反应、退出码 0x80000003、无任何日志」这类产物级故障。
---

# desktop-vue3 生产打包

## 适用范围

`desktop-vue3/`（Electron 39 + electron-egg/ee-bin + Vue3 + Vite 5）的 Windows x64 打包。
macOS / Linux 目标不在本技能范围。启动开发环境走 [desktop-vue3-dev-start](../desktop-vue3-dev-start/SKILL.md)。

---

## 一、前置检查（每次都做）

| 检查 | 命令 / 判据 |
| --- | --- |
| 子应用产物存在 | `Test-Path _plugins/plugin-hel-doubao-input-vue3/dist`。`cmd/builder.json` 的 `extraResources` 指向它，缺失会被 electron-builder 报错 |
| Electron 二进制就绪 | `desktop-vue3/node_modules/electron/dist/electron.exe` 存在 |
| better-sqlite3 ABI 对得上 | `ELECTRON_RUN_AS_NODE=1 electron.exe -e "require('better-sqlite3')..."` 期望 `process.versions.modules = 140`；不对就 `pnpm --filter desktop-vue3 run rebuild:sqlite` |
| `ELECTRON_RUN_AS_NODE` 未污染 | 打包前清空该变量，否则编译/启动链路会拿到 Node 版 Electron |

---

## 二、标准流程

`package.json` 里的 `build` / `build-w` 会经过 `pnpm run`，而 pnpm 12 的
`verifyDepsBeforeRun` 可能触发 15–20 分钟全量重装并重置 Electron / better-sqlite3 二进制。
打包时**直接调本地二进制**，与脚本等价：

```powershell
$env:ELECTRON_RUN_AS_NODE=$null

# 1) 子应用（首次或 _plugins/plugin-hel-doubao-input-vue3 有改动时）
Set-Location _plugins\doubao-input
& .\node_modules\.bin\vue-tsc.cmd -b
& .\node_modules\.bin\vite.cmd build

# 2) 前端类型 + 构建
Set-Location ..\..\desktop-vue3\frontend
& .\node_modules\.bin\vue-tsc.cmd --noEmit
$env:NODE_OPTIONS='--max-old-space-size=4096'   # 三套 UI 库同时注册，默认堆会 OOM
& .\node_modules\.bin\vite.cmd build

# 3) 产物搬到 public/dist
Set-Location ..
& .\node_modules\.bin\ee-bin.cmd move --flag=frontend_dist

# 4) 主进程 TS → public/electron
& .\node_modules\.bin\ee-bin.cmd build --cmds=electron

# 5) 打 NSIS 安装包，输出目录必须在仓库外（见第三节）
& .\node_modules\.bin\electron-builder.cmd --config=./cmd/builder.json -w=nsis --x64 --publish never `
  --config.directories.output=E:\coolma-release
```

要点：

- `electron-builder` 必须带 `--publish never`。`builder.json` 里有 GitHub draft 发布配置，避免误触发。
- `cmd/builder.json` 已设 `npmRebuild: false`，原生模块直接用第 1 步校验过的 ABI 140 二进制，不会调 MSVC。
- 只改了前端时，2–5 步可只跑 2、3、5。
- 只改了主进程 TS 时，必须跑第 4 步；`public/electron/**/*.js` 才是运行时真正加载的产物。

---

## 三、产物必须落在仓库外（关键坑）

在某些受限沙箱 / 代理环境里执行打包，产物会被打上 Windows 的
**Low 完整性级别**（`Mandatory Label\Low Mandatory Level`）。后果是致命的、但报错完全不像权限问题：

| 症状 | 机制 |
| --- | --- |
| 安装包报「不能打开要写入的文件 …\uninstallerIcon.ico」 | Low IL 进程不能向上写普通目录（如 `E:\coolma-vue3`），NSIS 创建文件被拒 |
| 免安装版双击没反应，退出码 `0x80000003`（STATUS_BREAKPOINT），无任何日志 | Chromium 不允许以 Low IL 启动，在 main 进程打日志之前就中止 |
| 同一 exe 复制到别的目录却能正常启动 | 目标目录若无 Low 标签，副本继承正常 ACL |

判别与处理见规则 [build-artifact-integrity](../../rules/build-artifact-integrity.mdc)。打包落地做法：

1. 用 `--config.directories.output=<仓库外路径>` 直接输出到干净目录，产物天然是 Medium。
2. 已经打进了 `desktop-vue3/out/`，就整份 `Copy-Item out\* <仓库外目录> -Recurse`，
   副本继承目标目录 ACL，标签随之消失；**不要试图用 `icacls /reset` 原地修**，沙箱通常拒绝改 SACL。
3. 仓库内 `desktop-vue3/out/**` 的产物只当中间产物，不给用户、不当交付物。

---

## 四、验收清单

| 检查 | 判据 |
| --- | --- |
| 产物标签干净 | `icacls <exe>` 输出里没有 `Mandatory Label\Low Mandatory Level` |
| 免安装版能起 | 启动 `win-unpacked\Coolma Vue3.exe`，进程存活，`MainWindowTitle = Coolma Vue3` |
| 主进程日志 | 出现 `[lifecycle] window-ready`、`[db] ready: … schemaVersion: N`、`[ee-core] Env: prod, Type: spa` |
| 页面来源是 asar | `App running at: …\resources\app.asar\public\dist\index.html` |
| asar 关键文件 | `public/electron/main.js`、`public/dist/index.html`、`node_modules/better-sqlite3/.../*.node`（后者应在 `app.asar.unpacked` 里） |
| 子应用随包 | `win-unpacked\resources\doubao-input\index.html` 存在 |
| 安装包 | `out\Coolma Vue3-<version>-x64.exe` 生成，体积约 110 MB；装到用户目录时不再报 `uninstallerIcon.ico` |

启动验证的小技巧：`Start-Process -PassThru` 起进程，`Start-Sleep 8` 后看 `HasExited` 与
`MainWindowTitle`；确认后 `taskkill /PID <pid> /T /F`，避免前台等待被 GUI 进程挂住。

---

## 五、与版本号的联动

打包前若需要升版，先读 [version-bump](../version-bump/SKILL.md)：

- `desktop-vue3/package.json` 的 `version` 决定安装包文件名与 `latest.yml`；
- 首次把 `0.1.0` 这类开发版本纳入日期规则时，直接取当天日期（如 `2026.11.22`）；
- 不升版直接重打，updater 会把新包当旧包，发版前务必核对。

---

## 六、失败速查

| 现象 | 首查 |
| --- | --- |
| `electron-builder` 报找不到 `_plugins/plugin-hel-doubao-input-vue3/dist` | 先构建子应用（第二节第 1 步） |
| 打包成功、安装报 `uninstallerIcon.ico` | 第三节（Low IL） |
| 免安装版静默退出 `0x80000003` | 第三节（Low IL）；同时用 `icacls` 对比一份能跑的位置 |
| 打包前莫名重装 20 分钟 | pnpm 12 `verifyDepsBeforeRun`；改走直接调二进制 |
| 安装包体积异常小 / 缺少页面 | `public/dist` 是否为本次构建产物；`ee-bin move` 是否执行 |
