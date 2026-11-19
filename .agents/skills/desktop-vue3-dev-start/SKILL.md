---
name: desktop-vue3-dev-start
description: 在 Windows 上启动 desktop-vue3（electron-egg + Vite + Vue3）桌面开发环境，或排查「启动后白屏 / Electron 崩溃 / better-sqlite3 报 ABI 不匹配 / vite 莫名退出」时使用。涵盖前置检查、两条启动路径、二进制修复与沙箱已知坑。
---

# desktop-vue3 开发环境启动

## 适用范围

启动或排查 `desktop-vue3/` 桌面端开发环境（Electron 39 + electron-egg/ee-bin + Vue3 + Vite 5）。

不适用：`desktop-vue2/`（Vue2 + Yarn，见 `.agents/rules/package-manager.mdc`）。

---

## 一、结构速览

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| 主进程源码 | `desktop-vue3/electron/**/*.ts` | TS，由 ee-bin 编译 |
| 主进程产物 | `desktop-vue3/public/electron/**/*.js` | **运行时实际加载的是这里**，不是源码 |
| 前端 | `desktop-vue3/frontend/` | Vite 5，固定端口 8081 |
| 构建脚本 | `desktop-vue3/cmd/bin.js` | ee-bin 的 dev/build 配置 |
| 数据库 | `%APPDATA%/desktop-vue3/coolma.db` | better-sqlite3，schemaVersion 见启动日志 |

---

## 二、启动前置检查（每次都做）

```bash
# 1. 依赖是否装齐（workspace 根）
pnpm install --frozen-lockfile

# 2. Electron 二进制是否就绪（缺 dist/electron.exe 会直接崩）
ls -la node_modules/electron/dist/electron.exe node_modules/electron/path.txt

# 3. 环境变量是否被污染（关键，见坑 1）
env | grep ELECTRON_RUN_AS_NODE

# 4. 主进程产物是否与源码同步（改了 TS 但没重编译会跑旧逻辑）
ls -la desktop-vue3/public/electron/main.js
```

---

## 三、两条启动路径

### 路径 A：标准启动（正常环境）

```bash
cd desktop-vue3
pnpm dev          # = ee-bin dev，同时起 vite + electron，带主进程 watch
```

拆分启动：

```bash
pnpm dev-frontend   # 只起 vite
pnpm dev-electron   # 只起 electron
```

### 路径 B：分进程手动启动（沙箱 / CI / pnpm 预检干扰时）

```bash
# 终端 1：前端
cd desktop-vue3/frontend
CODEBUDDY_SAFE_DELETE_ENABLED=0 ../../node_modules/.bin/vite

# 终端 2：主进程
cd desktop-vue3
unset ELECTRON_RUN_AS_NODE
CODEBUDDY_SAFE_DELETE_ENABLED=0 ../node_modules/.bin/electron . --env=local
```

**路径 B 的代价**：绕过了 ee-bin，主进程 TS **不会自动重编译**、没有 watch。
改完 `electron/**/*.ts` 必须手动重新编译后再重启：

```bash
cd desktop-vue3 && ../node_modules/.bin/ee-bin build --cmds=electron
```

---

## 四、五个高频坑

### 坑 1：`ELECTRON_RUN_AS_NODE=1` 污染

**现象**

```
TypeError: Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')
    at public/electron/main.js:6
```

同时 `electron --version` 输出的是 Node 版本（如 `v22.22.1`）而不是 Electron 版本（应为 `v39.8.10`）。

**根因**：宿主环境（WorkBuddy / 某些 IDE / CI）注入了 `ELECTRON_RUN_AS_NODE=1`，Electron 以纯 Node 模式运行，`require('electron')` 返回的是包路径字符串而非 API 对象。

**解法**

```bash
unset ELECTRON_RUN_AS_NODE
```

**快速判别**：`electron --version` 输出 `v39.x` 才对，输出 `v22.x` 就是被污染了。

---

### 坑 2：pnpm 12 的 `verifyDepsBeforeRun` 反复重装

**现象**：执行 `pnpm dev` / `pnpm run xxx` 前，先打出一大段 `Scope: all 11 workspace projects` + `Progress: resolved 1855...`，耗时 15–20 分钟，且会把 `node_modules/electron/dist` 和 `better-sqlite3/*.node` 重置掉。

**根因**：pnpm 12 默认在 run script 前校验依赖树，不一致就全量重装。

**解法（三选一）**

1. 在仓库根 `.npmrc` 增加 `verify-deps-before-run=false`（推荐，持久）；
2. 走路径 B，绕过 `pnpm run`，直接调用 `node_modules/.bin/*`；
3. 临时用 `pnpm --config.verify-deps-before-run=false run <script>`。

注意：环境变量 `npm_config_verify_deps_before_run=false` 在 pnpm 12 下**不生效**（`pnpm config get` 返回 undefined），别浪费时间。

---

### 坑 3：`better-sqlite3` ABI 不匹配

**现象**

```
The module ... better_sqlite3.node was compiled against a different Node.js version
using NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 140.
code: 'ERR_DLOPEN_FAILED'
```

启动日志表现为 `[preload] database init failed`，界面能开但数据库功能全废。

**根因**：`node_modules/better-sqlite3` 的 `.node` 是按 Node 22（ABI 127）编译的，Electron 39 需要 ABI 140。

**标准解法**

```bash
cd desktop-vue3 && pnpm rebuild:sqlite
```

该脚本（`scripts/fetch-better-sqlite3-prebuild.mjs`）会用 Electron 查 ABI 并从 npmmirror 拉对应预编译包。

**Windows 补充坑**：脚本内 `tar -xzf C:\...` 会因盘符冒号被 GNU tar 误判为远程主机，报
`tar (child): Cannot connect to C: resolve failed`。改为 `tar --force-local -xzf` 即可。手动兜底：

```bash
cd /d/work-coolma/coolma/coolma
curl -sL "https://registry.npmmirror.com/-/binary/better-sqlite3/v12.11.1/better-sqlite3-v12.11.1-electron-v140-win32-x64.tar.gz" -o /tmp/sqlite.tar.gz
mkdir -p node_modules/better-sqlite3/build/Release
tar --force-local -xzf /tmp/sqlite.tar.gz -C node_modules/better-sqlite3
```

**验证**

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e \
  "const db=require('better-sqlite3'); const d=new db(':memory:'); d.exec('create table t(a)'); d.prepare('insert into t values (?)').run(42); console.log('OK', process.versions.modules, d.prepare('select a from t').get());"
# 期望输出：OK 140 { a: 42 }
```

---

### 坑 4：沙箱 safe-delete 拦截器杀死 vite

**现象**：vite 启动后刚打出 `ready`，优化依赖时突然进程退出：

```
Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
{"count":54,"threshold":50,"scope":"turn","targets":[".../frontend/node_modules/.vite/deps_temp_xxx"]}
```

**根因**：vite 优化依赖时会整体删除 `deps_temp_*` 目录，文件数超过沙箱批量删除阈值（50）被拦截抛错，vite 进程随之崩溃。

**解法**

```bash
export CODEBUDDY_SAFE_DELETE_ENABLED=0
```

仅在受沙箱管控的环境需要；正常终端不需要。

**连带现象**：vite 崩溃后 Electron 会打 `ERR_CONNECTION_REFUSED` / `Failed to fetch dynamically imported module: HomeView.vue`。vite 恢复后 **必须重启 Electron**，不会自动重连。

---

### 坑 5：ESM 动态 import 缺 `.js` 扩展名（代码问题，非环境）

**现象**（启动后 WARN/ERROR，不阻塞窗口）

```
[lifecycle] register coolma protocol failed
[preload] auto backup failed: Error [ERR_MODULE_NOT_FOUND]:
Cannot find module '.../public/electron/service/db/backup'
```

**根因**：源码写的是 `import('../service/db/backup')`、`import('../service/coolma-protocol')`，编译到 ESM 后 Node 严格解析要求带 `.js`。文件其实存在。

**修复位置**：`desktop-vue3/electron/preload/index.ts`、`desktop-vue3/electron/preload/lifecycle.ts`，给动态 import 补 `.js` 后缀。

**状态**：截至 2026-11-19 该问题仍存在，属待修代码缺陷，不影响主界面。

---

## 五、故障排查速查表

| 现象 | 首查 |
| --- | --- |
| `registerSchemesAsPrivileged` undefined | 坑 1（`ELECTRON_RUN_AS_NODE`） |
| `electron --version` 显示 v22.x | 坑 1 |
| 启动前莫名重装 20 分钟 | 坑 2（`verifyDepsBeforeRun`） |
| `NODE_MODULE_VERSION 127 / 140` | 坑 3（`pnpm rebuild:sqlite`） |
| `SAFE_DELETE_BULK_CONFIRM_REQUIRED` | 坑 4 |
| 窗口白屏 + `ERR_CONNECTION_REFUSED` | vite 是否活着；vite 崩溃后需重启 Electron |
| 跑的是旧逻辑，改了 TS 没生效 | 路径 B 无 watch，需 `ee-bin build --cmds=electron` |
| `Cannot find module .../service/db/backup` | 坑 5 |

---

## 六、启动成功判定

同时满足以下四条即正常：

1. 日志出现 `[lifecycle] window-ready`
2. 日志出现 `[db] ready: ...coolma.db schemaVersion: N`
3. 日志出现 `[ee-core] App running at: http://127.0.0.1:8081`
4. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/` 返回 `200`
5. 窗口标题为 `Coolma Vue3`

```bash
# 一次核对
curl -s -o /dev/null -w "vite HTTP %{http_code}\n" http://127.0.0.1:8081/
tasklist | grep -ci electron    # 正常为 4 个进程
```
