# 参考源码基线（2026-11-09）

上游源码只放在本地 `.tmp/`，**不提交到仓库**。本文件记录版本、用途和复现方式。

## 1. 下载清单

| 目录 | 仓库 / 分支 | Commit | 日期 | 版本 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `.tmp/electron-egg-ts/` | [wallace5303/electron-egg](https://github.com/wallace5303/electron-egg) `demo_v4_ts` | `0a4de6456b3f02d8e296b8593d33ffcdaeb2b571` | 2025-12-30 | `4.2.0`（官方最新全栈 TS demo） | 目标工程脚手架、主进程/preload/构建基线 |
| `.tmp/electron-egg-v5/` | [wallace5303/electron-egg](https://github.com/wallace5303/electron-egg) `dev_v5` | `2fce364f1cb9d2a67d85b443de91421215ecfce5` | 2026-09-13 | `5.0.0`，`ee-core 5.0.3` | 新版架构参考（主进程 TS、Vue3 JS 前端） |
| `.tmp/coolma-electron/` | [ui-javascript/coolma-electron](https://github.com/ui-javascript/coolma-electron) `master` | `56d135e88d12aa7066c171fa789b68478730aa7d` | 2026-11-04 | `2026.11.4` | 业务与 UI 复刻来源 |

三个目录均为 `--depth 1` 浅克隆，仅作本地参照。

## 2. 版本判断

- **`demo_v4_ts` 是 electron-egg 目前唯一的官方全栈 TypeScript demo**：
  主进程 `electron/**/*.ts`，前端 `frontend/src/**/*.ts` + Vue 3 + Vite。
- `dev_v5` 的主进程已经 TS 化，但 `frontend/src` 仍是 **JavaScript**，且仓库改成了
  pnpm workspace。它不是“v5 TS 版 demo”。
- 因此本项目以 `demo_v4_ts` 为脚手架基线，按需借鉴 v5 的主进程 API / 安全改进。

## 3. 复现命令

```powershell
# 目标目录：E:\work-coolma-vue3
mkdir .tmp

git clone --depth 1 --branch demo_v4_ts `
  https://github.com/wallace5303/electron-egg.git .tmp/electron-egg-ts

git clone --depth 1 --branch dev_v5 `
  https://github.com/wallace5303/electron-egg.git .tmp/electron-egg-v5

git clone --depth 1 `
  https://github.com/ui-javascript/coolma-electron.git .tmp/coolma-electron
```

## 4. 许可

| 项目 | 许可 | 使用注意 |
| --- | --- | --- |
| electron-egg | Apache-2.0 | 保留 NOTICE / 版权声明；衍生作品需标注修改 |
| coolma-electron | MIT | 可复用代码，但须保留版权与许可声明 |
| coolma-muya | MIT | 编辑器的上游衍生，复用前核对 MarkText / Muya 的 MIT 声明 |

公开发布前需增加 `THIRD_PARTY_NOTICES.md`。

## 5. 扫描结论

- `api.js`：27 个 `handleApi` 通道。
- `electron-main.js`：99 个 `ipcMain.handle/on` 通道（去重）。
- 合计 **126 个 IPC 通道**，迁移时必须逐域建立映射，不能 1:1 平移。
- 核心表 12 张，另有 `rune_templates` / `note_templates` 由 service 建表。
- 前端 276 个文件；主进程 49 个文件；`electron-main.js` 4079 行。
