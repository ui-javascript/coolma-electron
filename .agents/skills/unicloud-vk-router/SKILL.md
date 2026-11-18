---
name: unicloud-vk-router
description: 面向 coolma 项目的 uniCloud + vk-router 云函数集成指南。用于分析、修改或扩展 Memocast 的云函数调用链路、单 router 路由模式、uni-id 用户体系、匿名游客与登录态切换、url 化形态的 axios 调用方式，以及 vk-* 头（vk-appid / vk-platform / vk-locale / uni-id-token）的注入。遇到 unicloud、vk-router、云函数、单 router 路由、uni-id、uni-id-token、匿名游客、guest、url 化、bspapp、bspapp.com/http/router、登录态、登出、checkToken、token 刷新、kh/pub/sys、公共模块 uni-id-common、服务空间、db.command、vk.baseDao、uni-cloud-router 关键词时应自动使用。
---

# uniCloud + vk-router 云函数集成（coolma）

## 目标

把 coolma 主项目当前的云函数调用抽象（`src/utils/cloud-router.js` + `src/services/cloud/CloudFunctionProvider.js`）封装为稳定可复用的人工指南，确保后续继续接入、切换 lafyun 或自建后端时只用动最小的代码面。

## 默认认知

- **形态锁定**：本项目**只**采用 vk-router 的 **url 化形态**，即 `https://<appid>.bspapp.com/http/router/<service>/<module>/<action>`，不引入 `vk.callFunction({isRequest:true})` 路径。前端统一走 axios（见 `src/utils/cloud-router.js`）。
- **不引入** unicloud / vk 客户端 SDK；只用 axios + `src/services/cloud/CloudFunctionProvider.js` 暴露的 `cloud.invoke(name, data)` / `cloud.upload(name, payload)`。
- **单 router 云函数路由**：后端在 DCloud 云空间里只部署一个名为 `router` 的云函数，`package.json` 里设置 `"path": "/http/router"`，云函数内部按 url 分发到 `service/<module>/<action>`。
- **登录态与匿名态共存**：token 可能为空时也要正常工作；空 token 命中 `pub/*` 接口正常返回，命中 `kh/*` 时由 kh 过滤器统一抛 `TOKEN_INVALID_ANONYMOUS_USER` / `uni-id-check-token-failed`，前端拦截后引导登录。
- **本地优先不变**：coolma 的 SQLite 仍是真实数据源，云函数只承担控制面（账号、设置同步、远程备份的下发/上报）；不要把同步主路径押到云函数上。

## 自动触发关键词

| 类别 | 关键词 |
|------|--------|
| **技术栈** | unicloud、vk-router、vk-unicloud、bspapp、云函数、云对象、单 router、router 路由 |
| **认证** | uni-id、uni-id-token、uni-id-common、checkToken、匿名、游客、guest、ANONYMOUS、登录、登出、token 刷新、tokenExpired |
| **调用头** | vk-appid、vk-platform、vk-locale、uni-id-token、url 化、isRequest:true、bspapp.com/http/router |
| **端点** | login、register、keepTokenAlive、user/info、user/sys/list、user/sys/login、admin/vkfiles/pub/listFiles、system/ping |
| **错误码** | TOKEN_INVALID_ANONYMOUS_USER、uni-id-check-token-failed、uni-id-token-expired、returnCode |

## 当前客户端约定（coolma 侧）

### 配置与凭据落点

| 项 | localStorage key | 备注 |
|----|----|----|
| baseUrl | `cloudfn.config.baseUrl` | 渲染进程可写，跨窗口同步；末尾 `/` 会被裁掉 |
| appId | `cloudfn.config.appId` | 写入 `vk-appid` 头 |
| platform | `cloudfn.config.platform` | `h5` / `electron` / `app-plus` / `mp-weixin` |
| locale | `cloudfn.config.locale` | 写入 `vk-locale` 头 |
| token | `cloudfn.token` | 登录后写；登出清空 |

不依赖 `electron-store`，避免主进程 IPC 链路；后续要加密再加。

### 调用形态

```js
import cloud from 'src/services/cloud/CloudFunctionProvider'

// 登录
const r = await cloud.invoke('user/sys/login', { userId, password })
cloud.setToken(r.token)        // 后续自动塞到 uni-id-token 头

// 任意业务调用（router 内部分发）
const data = await cloud.invoke('user/sys/userInfo', { uid: r.uid })

// 上传资源
await cloud.upload('resource/upload', file, {
  fieldName: 'file',
  extraFields: { kbGuid, docGuid }
})
```

### 返回值约定

云端 VK 规范（`returnCode==0`/`code==0` 视为成功）。`src/utils/cloud-router.js#unwrap` 已做了兼容：

| 形态 | 处理 |
|----|----|
| `{ code: 0, msg: '...' }` | 返回 `result`/`data` 字段 |
| `{ returnCode: 200, ... }` | 同上 |
| `{ result: ... }` | 直接返回 `result` |
| `{ code: -1, msg: '...', externCode? }` | 抛 `CloudFnError(message, code, externCode)` |
| HTTP 网络异常 | 抛 `CloudFnError`，`code = <http status or 'NETWORK_ERROR'>`，同时 `bus.$emit(events.REQUEST_ERROR)` |

前端消费时应只看到 `try / catch` 包裹 + 解包后的业务数据；不要在业务层再判断 `code`/`result`。

## 云端约定（vk-router 侧）

### 路由形态

```
https://<appid>.bspapp.com/http/router/<service>/<module>/<action>
```

云函数 `router/package.json` 必填：

```json
{
  "cloudfunction-config": {
    "concurrency": 1,
    "memorySize": 512,
    "path": "/http/router",
    "timeout": 60,
    "triggers": [],
    "runtime": "Nodejs12"
  }
}
```

### 目录约定（建议）

```
router/
├── service/
│   ├── admin/                # 后台管理端逻辑（需 sys 登录）
│   ├── client/               # 客户端逻辑（H5、小程序、APP）
│   ├── common/               # 公共逻辑（多端复用）
│   ├── user/                 # 统一用户中心（已集成 uni-id）
│   │   ├── kh/              # 必须登录：filterResponse 已带 uid/userInfo
│   │   ├── pub/             # 所有人可调用：不解析 token
│   │   └── sys/             # 仅云端管理员可调用
│   └── template/             # 云函数模板
├── util/
│   ├── pubFunction.js       # 公共业务函数
│   ├── pubFun.js
│   └── urlrewrite.js        # URL 美化与隐藏真实路径
├── package.json
└── index.js                 # 入口（一般由模板生成）
```

**filters（`router/middleware/filter.js`）规则**：

| id | regExp | 类型 | 说明 |
|----|----|----|----|
| pub | `/pub/` | onActionExecuting | 所有人可访问，不解析 token |
| kh | `/kh/` | onActionExecuting | 必须登录；filterResponse 内带 `uid`/`userInfo` |
| sys | `/sys/` | onActionExecuting | 仅后端管理员角色可调用 |

### 云函数统一返回值

成功：

```js
return { code: 0, msg: 'ok', ...result }
```

失败：

```js
return { code: -1, msg: '...错误信息...' }
```

可选特殊字段：

```js
// 通知前端自动更新本地 userInfo（仅 kh 链路）
return { code: 0, msg: 'ok', needUpdateUserInfo: true, userInfo: {...} }

// 通知前端刷新 token（uni-id 接近过期）
return {
  code: 0,
  msg: 'ok',
  vk_uni_token: { token: 'new...', tokenExpired: 1681818627000 }
}
```

### uni-id-common（公共模块）关键用法

服务端（任一需要解析 token 的云函数入口）：

```js
const uniID = require('uni-id-common')

exports.main = async function (event, context) {
  context.APPID    = '__UNI__XXXXXX'   // 或 context.APPID from headers
  context.PLATFORM = 'h5'
  context.LOCALE   = 'zh-Hans'

  const uniIDIns = uniID.createInstance({ context })

  const r = await uniIDIns.checkToken(event.uniIdToken)
  if (r.errCode) {
    // r.errCode === 'uni-id-token-expired' 或 'uni-id-check-token-failed'
    return { code: r.errCode, msg: r.errMsg || r.message }
  }
  // r.token 可能在 tokenExpiresThreshold 命中时被云端刷新
  if (r.token) event.uniIdToken = r.token   // 一定要原样回写给前端
  // r.uid / r.role / r.permission 可信
  // ...
  return { code: 0, msg: 'ok', uid: r.uid }
}
```

⚠️ **匿名游客**：若 `event.uniIdToken` 为空或 `checkToken` 返回 `uni-id-check-token-failed`，**直接当游客处理**，不要 throw 阻断；pub 链路天然支持匿名，kh 链路才需要拦截。

## 匿名游客用户模式（重点）

coolma 在云函数链路里要同时支持"未登录照样可用"和"登录后才有完整能力"两种模式。

### 设计原则

1. **前端决不假定有 token**：`cloud.invoke` 不带 `uni-id-token` 头走到底就视为匿名。
2. **云端 pub/* 不依赖 token**：`router/middleware/filter.js` 的 pub 过滤器不要去 `checkToken`。
3. **云端 kh/* 必须登录**：由 `kh` 过滤器在中间件层拦截；失败的统一返回：
   ```js
   { code: 'TOKEN_INVALID_ANONYMOUS_USER', msg: '未能获取当前用户信息：当前用户为匿名身份' }
   ```
   前端 `CloudFnError` 的 `externCode === 'TOKEN_INVALID_ANONYMOUS_USER'` 时触发登录提示。
4. **匿名权限**：opendb 表 schema 中的 permission 用 `auth.uid == null || ...` 显式声明允许匿名读。

### 前端落地方式

- 启动 / token 失效 → **清空 token，走匿名**：`cloud.clearToken()`，业务调用照旧。
- 匿名调用被云端拒 → **触发一次"登录引导"弹框**（按需，复用 `LoginDialog`）：
  ```js
  try {
    return await cloud.invoke('note/list', { kbGuid: 'mine' })
  } catch (e) {
    if (e.code === 'TOKEN_INVALID_ANONYMOUS_USER' || e.code === 'uni-id-check-token-failed') {
      bus.$emit('cloudFunctionNeedLogin', { from: 'note/list' })
    }
    throw e
  }
  ```
- 登录成功 → `cloud.setToken(result.token)` 即可，**无需刷新页面**。

### token 失效刷新

uni-id 默认有效期 7 天；`tokenExpiresThreshold` 触发提前刷新（默认 5 分钟）。客户端 SDK 会自动保存新 token；**本项目用 axios 自实现**，需手动处理：

```js
// 在 src/utils/cloud-router.js 的 unwrap 处增加：
function unwrap (data) {
  // ... 原有逻辑 ...
  if (data && data.vk_uni_token && data.vk_uni_token.token) {
    cloud.setToken(data.vk_uni_token.token)   // 注意 setToken 内部对 cfg.token 也同步写
  }
  return /* 解包后的业务数据 */
}
```

> 单 router 形态的 vk-router，**由云端统一在过滤器里**处理 token 刷新并回写到响应里。业务函数不需要单独处理。

## 实现注意事项（动手前先看）

1. **CORS**：腾讯云与阿里云对公网调用都放行了 CORS；本项目是 Electron + Vue2 渲染进程（`platform: 'electron'` 或 `h5`），跨域不会触发 CORS 拦截。如果出现 `No 'Access-Control-Allow-Origin' header`，说明 baseUrl 配错或走了 IP 而非 bspapp 域名，**不要**用 `webSecurity: false` 兜底。
2. **baseUrl 末尾 `/`**：`src/utils/cloud-router.js` 已 `replace(/\/+$/, '')`，写入和读取都兼容。
3. **POST 方法**：vk-router url 化形态**只接受 POST**，前端 axios 必须 `method: 'POST'`（不要跟随 RESTful 的 GET/DELETE）。
4. **headers 必填**：`content-type: application/json;charset=utf8`、`vk-appid`、`vk-platform`，缺一会跑通但日志里会看到 `getAppInfo` 异常。
5. **保持单 router**：`url` 化路径必须固定到 `/http/router`，其它如 `/foo/bar` 不会被云端识别为云函数 url 化入口。
6. **不要让 CloudFunctionProvider 失败回退到 WizNote**：上层逻辑 (`store/server/actions.js`) 自行决定"云端不可用时返回本地数据"，**不要**让 provider 自己降级——避免与本项目"本地优先"原则冲突。

## 推荐工作流程

### 1. 新增云函数接口

1. 在 `router/service/<x>/<y>.js` 按 vk 规范写 `main({ data, util, ... })`。
2. 入参 `data` 全部来自前端 axios `data`；返回 `{ code, msg, ... }`。
3. 需要登录 → 放 `kh/`；纯公共 → 放 `pub/`；管理员 → 放 `sys/`。
4. 本地前端：在 `src/services/cloud/` 下新建 `XxxService.js`，统一用 `cloud.invoke('<x>/<y>/<action>', data)`，不做 raw axios。
5. i18n key 写入 `src/i18n/zh-cn/components/ui/SettingsDialog.js` 的 `cloudFunction*` 系列（如 `cloudFunction<Name>Label` / `cloudFunction<Name>Hint`）。

### 2. 替换 WizNote 接口

迁移（参考 `_todo/TODO-云函数调研存档-202607.md` 第 4 节）：

| 当前 | 替换为 |
|----|----|
| `AccountServerApi.Login` | `cloud.invoke('user/sys/login', { userId, password })` |
| `AccountServerApi.getUserInfo` | `cloud.invoke('user/sys/userInfo', { token })` |
| `KnowledgeBaseApi.getCategories` | `cloud.invoke('note/categories', { kbGuid })` |
| `KnowledgeBaseApi.getCategoryNotes` | `cloud.invoke('note/list', { kbGuid, ... })` |
| `KnowledgeBaseApi.upload` | **保留** WizNote，v1 双后端并存 |

操作要点：
- 登录返回的 `kbGuid` 由云函数按需下发，沿用本地 SQLite 的 `kb_guid` 字段。
- token 永不过期处理：监听 `vk_uni_token` 写回。
- 任何 kh 接口失败 → 触发登录引导（参见上文"匿名游客"）。

### 3. 切换后端（lafyun / 自建 / 换服务空间）

只动 `src/utils/cloud-router.js`：把 `baseUrl` 替换、把 header 名换掉；`cloud.invoke` 接口签名不变；上层全部业务代码不动。这是 url 化形态的最大价值。

## 关键文件索引

| 文件 | 用途 |
|----|----|
| `src/utils/cloud-router.js` | axios + vk 头 + 解包 + 错误归一（url 化唯一入口） |
| `src/services/cloud/CloudFunctionProvider.js` | `getConfig/setConfig/setToken/clearToken/invoke/upload` |
| `src/services/cloud/VkFilesService.js` | 已有调用：`admin/vkfiles/pub/listFiles` |
| `src/services/cloud/BspAppDemoService.js` | 测试 demo 与设置页联通按钮 |
| `src/components/ui/dialog/CloudFnConfigDialog.vue` | 设置子组件：baseUrl / appId / platform / token |
| `src/components/ui/dialog/SettingsDialog.vue` | 把 CloudFnConfigDialog 挂到 `cloudFn` tab |
| `src/i18n/zh-cn/components/ui/SettingsDialog.js` | `cloudFunction*` i18n key |
| `src/i18n/en-us/components/ui/SettingsDialog.js` | 同上英文版 |
| `_todo/TODO-云函数调研存档-202607.md` | 决策与风险存档 |

## 扩展阅读

- 详细端点、字段、错误码与 curl 调试示例见 [reference.md](reference.md)。
- 与本地优先同步层的关系见父级 `sync-design` skill。
- 替换 WizNote 接口的边界与登录副作用见父级 `wiznote-api` skill。

## 收尾检查

完成后自查：

- [ ] 是否遵循 vk-router url 化形态（baseUrl + POST + axios）
- [ ] `cloud.invoke` 调用是否未在业务层判断 `code`/`result`
- [ ] pub / kh / sys 路径是否符合中间件约束
- [ ] 匿名游客路径是否会因为 `kh` 过滤器阻断而整体崩掉
- [ ] token 刷新（`vk_uni_token`）是否被前端持久化
- [ ] i18n key 是否新增 `cloudFunction*` 一组并补全两种语言
- [ ] 是否新增 service 文件而非在 `actions.js` 里直接 raw axios
