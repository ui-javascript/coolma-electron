# uniCloud + vk-router 详细参考

本文档是 [SKILL.md](SKILL.md) 的详细补充，沉淀 vk-router url 化形态的端点格式、HTTP 头语义、错误码表、目录约定与调试方法。

## 1. 客户端发送形态（axios 模板）

### 1.1 完整结构

```js
axios({
  method: 'POST',
  url: 'https://<appid>.bspapp.com/http/router/<service>/<module>/<action>',
  headers: {
    'content-type': 'application/json;charset=utf8',
    'vk-appid': '__UNI__XXXXXX',         // 即 manifest.json 中的 dcloud_appid
    'vk-platform': 'h5',                 // h5 / mp-weixin / app-plus / electron
    'vk-locale': 'zh-Hans',              // 可选
    'uni-id-token': '<登录后获取的 token>'  // 可选，匿名时省略
  },
  data: { ...业务参数 }
})
```

### 1.2 头字段语义

| 头 | 是否必填 | 取值 | 说明 |
|----|----|----|----|
| `content-type` | **必填** | `application/json;charset=utf8` | 一定写 utf8，URL 化没有 form 编码兜底 |
| `vk-appid` | **必填** | `__UNI__XXXXXX` | 云函数日志里 getAppInfo 用 |
| `vk-platform` | **必填** | `h5` / `mp-weixin` / `app-plus` / `electron` / `app` / ... | 多端同空间时用于分支 |
| `vk-locale` | 否 | `zh-Hans` / `en-US` / ... | 影响后端消息国际化 |
| `uni-id-token` | 否 | 登录返回的字符串 | 缺省视为匿名 |

### 1.3 POST 是唯一合法方法

URL 化形态**不支持** GET / PUT / DELETE。vk-router 的 url 化入口是 HTTP Gateway 的固定函数代理，方法集由云函数运行模式决定，与 RESTful 风格无关。强行用 GET 会得到 gateway 504/404。

### 1.4 数据包格式

- **入参 `data` 即业务参数**，前端 axios `data: { a:1, b:'x' }` 对应云函数 `event.data = { a:1, b:'x' }`。
- 没有 query 参数机制（路径里的 `?` 不会进 `event.queryStringParameters`）。
- 文件上传：使用 `multipart/form-data`；见下文第 6 节。

## 2. 服务空间与 baseUrl

### 2.1 baseUrl 三要素

```
https://<appid>.bspapp.com/http/router
```

| 段 | 含义 |
|----|----|
| `<appid>` | DCloud 后台 → 服务空间 → 基本信息 → 服务空间 ID，阿里云也以 `bspapp.com` 暴露 |
| `/http/router` | **必须**与 `router/package.json` 中 `cloudfunction-config.path` 完全一致 |

### 2.2 多服务空间

| 平台 | 多空间支持 | 备注 |
|----|----|----|
| 阿里云 | 支持 | `uniCloud.init({ provider:'aliyun', spaceId })` |
| 腾讯云 | 支持 | 略有限制，云函数内 `myCloud.callFunction` 才能跨空间 |
| 支付宝云 | 支持 | 较新，部分 API 仍以阿里云文档为主 |

coolma 当前不接多服务空间，未来要接时改 `src/utils/cloud-router.js` 加 provider 切换，与业务代码无关。

### 2.3 路径隐藏与美化

通过 `router/util/urlrewrite.js`：

```js
module.exports = {
  rule: {
    '^goods/getList$': 'client/goods/pub/getList',
    '^api/goods/detail/(.+)$': 'client/goods/pub/detail?id=$1',
  },
  config: { accessOnlyInRule: false }   // false 表示未声明也能访问
}
```

**安全原则**：
- 对外公开的地址**尽量不要**带 `pub` / `kh` / `sys` 字样。
- 公开接口统一前缀，例如 `/api/` / `/open/`。
- urlrewrite 只是地址美化，**不是权限系统**——真正的权限仍由 `filter.js` 控制。

## 3. 云端目录与过滤器

### 3.1 标准目录

```
router/
├── service/
│   ├── admin/                # 后台管理端
│   ├── client/               # 客户端
│   ├── common/               # 多端公共
│   ├── user/                 # 已集成 uni-id
│   │   ├── kh/              # 必须登录
│   │   ├── pub/             # 公共
│   │   └── sys/             # 管理员
│   └── template/             # 模板
├── util/
│   ├── pubFunction.js
│   ├── pubFun.js
│   └── urlrewrite.js
├── middleware/
│   └── filter.js             # pub / kh / sys 过滤器
├── package.json
└── index.js
```

### 3.2 过滤器规则（`router/middleware/filter.js`）

| id | regExp | index | mode | 说明 |
|----|----|----|----|----|
| pub | `/pub/` | 100 | onActionExecuting | 不解析 token |
| kh | `/kh/` | 200 | onActionExecuting | 解析 token，缺失则拦截 |
| sys | `/sys/` | 300 | onActionExecuting | 检查用户角色 |
| 自定义 | `^client/shop/manage/(.*)` | >300 | onActionExecuting | 业务级（如商家权限） |

**index 越大越后执行**：自定义业务过滤器一般 `index > 300`，等到 sys 之后才检查角色。

### 3.3 框架提供的能力

| 项 | 路径 / 调用 | 用途 |
|----|----|----|
| vk 实例 | `util.vk` | 框架提供的全局工具 |
| 数据库 | `util.db` + `util._` (`db.command`) | CRUD（替代原 `uniCloud.database()`） |
| uniID 实例 | `util.uniID` | 框架已 `createInstance`，直接 `checkToken` |
| 公共函数 | `util.pubFun` | 业务级公共函数（`util/pubFunction.js`） |
| filter 数据 | `event.filterResponse` | 上游中间件写入的数据，例 `{ uid, userInfo }` |

### 3.4 业务函数标准格式

```js
module.exports = {
  /**
   * @url user/kh/setAvatar
   * @description 修改头像
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse } = event
    let { vk, uniID, db, _, pubFun } = util
    let { uid } = data                  // ← 仅 kh 链路可信
    
    let res = { code: 0, msg: '' }
    try {
      await vk.baseDao.update({ db, table: 'uni-id-users', whereJson: { _id: uid }, dataJson: { avatar: data.avatar } })
    } catch (err) {
      return { code: -1, msg: err.message }
    }
    return res
  }
}
```

## 4. uni-id 体系与 token 生命周期

### 4.1 token 三件事

| 事情 | 位置 | 触发 | 处理 |
|----|----|----|----|
| 登录获取 | `user/sys/login` 或 `user/kh/login`（vk-router 模板内置） | 用户手动登录 / 第三方 OAuth | 返回 `token` |
| 校验 | `uniIDIns.checkToken(uniIdToken)` | 每次 `kh/*` 调用 | 返回 `{ errCode, uid, role, permission, token?, tokenExpired? }` |
| 刷新 | 自动 | token 接近过期 | 响应里带回 `vk_uni_token`，前端替换 |

### 4.2 token 自动刷新机制

- 默认 `tokenExpires = 7` 天。
- `tokenExpiresThreshold` 控制提前量（默认 5 分钟）。
- 当服务端 `checkToken` 发现 token 剩余有效期 < `tokenExpiresThreshold` 且 > 0，自动生成新 token 回写。
- 前端必须把这个新 token 保存到 `localStorage.cloudfn.token`，否则下次仍带旧 token。

### 4.3 错误码表

| errCode / code | 触发场景 | 前端动作建议 |
|----|----|----|
| `0` | 成功 | 继续 |
| `uni-id-token-expired` | token 已过期 | `cloud.clearToken()` 后引导登录 |
| `uni-id-check-token-failed` | token 无效 / 被踢 | 同上 |
| `TOKEN_INVALID_ANONYMOUS_USER` | 客户端未带 token 但接口要求 | 引导登录 |
| `uni-id-account-banned` | 账号被封 | 引导重置 / 联系客服 |
| `uni-id-password-error` | 密码错误 | UI 提示「密码错误」 |
| 网络异常 | baseUrl 错误 / 跨域 | 弹「请检查云函数配置」 |

### 4.4 uni-id-common 必须 createInstance

旧 `uni-id` 是单例；`uni-id-common` 必须：

```js
const uniID = require('uni-id-common')
const uniIDIns = uniID.createInstance({ context })
```

**不要**直接 `uniID.checkToken(...)`，否则新版会报 "uniIDIns is not a function"。

## 5. 匿名游客模式实战

### 5.1 为什么需要它

coolma 当前对**未登录用户**仍要可用：
- 打开 app 立刻能拉取导航中心（`admin/vkfiles/pub/listFiles` 是 pub 链路，天然支持）。
- 离线时所有数据都在本地 SQLite，**根本不需要**云端辅助。
- 用户第一次点 "登录为知账号" 才进入 kh 链路。

### 5.2 pub / kh / sys 在匿名时的区别

| 场景 | pub | kh | sys |
|----|----|----|----|
| 无 token | ✅ 直接调用 | ❌ `TOKEN_INVALID_ANONYMOUS_USER` | ❌ |
| 有有效 token | ✅ 调用 | ✅ 调用 | 按 role 判定 |
| token 过期 | ✅ 调用 | ❌ `uni-id-token-expired` | ❌ |

> pub 与 token 无关，即使带了过期 token 也照样成功。

### 5.3 前端三层处理

```js
// 第 1 层：正常的 invoke
const r = await cloud.invoke('note/list', { kbGuid: 'mine' })

// 第 2 层：捕获匿名 / token 失败
try {
  return await cloud.invoke('note/list', { kbGuid: 'mine' })
} catch (e) {
  if (['TOKEN_INVALID_ANONYMOUS_USER', 'uni-id-check-token-failed', 'uni-id-token-expired'].includes(e.code)) {
    cloud.clearToken()
    bus.$emit('cloudFunctionNeedLogin', { from: 'note/list' })
    return null   // 让上层走本地优先
  }
  throw e
}
```

### 5.4 云端支持匿名的 schema 示例

opendb 表 `guestbook`：

```json
{
  "permission": {
    "read": "(auth.uid == null && doc.state == true) || doc.state == true || doc.user_id == auth.uid || 'AUDITOR' in auth.role",
    "create": "auth.uid != null",
    "update": "'AUDITOR' in auth.role",
    "delete": false
  }
}
```

要点：
- 写动作 `auth.uid != null`（必须登录）。
- 读动作允许匿名读已审核的：`auth.uid == null && doc.state == true`。
- 自己写自己读：`doc.user_id == auth.uid`。
- 审计员角色：`'AUDITOR' in auth.role`。

## 6. 文件上传

### 6.1 client → 云函数

```js
const fd = new FormData()
fd.append('file', blob, 'a.png')
fd.append('kbGuid', 'xxx')
fd.append('docGuid', 'yyy')

await cloud.upload('resource/upload', fd, {
  fieldName: 'file',
  extraFields: { kbGuid: 'xxx', docGuid: 'yyy' }
})
```

### 6.2 server 端接收

```js
// router/service/resource/pub/upload.js
const uniID = require('uni-id-common')

exports.main = async (event, context) => {
  // url 化模式下 event.body 含原始 multipart 字符串
  // 一般做法：在 vk-router 模板下 `event.file = ...` 由中间件解析
  // 参考 vk 模板的 resource/upload 默认实现
  return { code: 0, msg: 'ok', url: 'https://...' }
}
```

### 6.3 上传后替换 token

上传响应同样可能带回 `vk_uni_token`，`src/utils/cloud-router.js#unwrap` 要做集中处理。

## 7. 调试方法

### 7.1 浏览器直接看会触发下载

`GET https://<appid>.bspapp.com/http/router` → 直接下载云函数返回的二进制响应体。
**不要**用浏览器测；用 Postman / curl。

### 7.2 curl 模板

```bash
curl -X POST 'https://<appid>.bspapp.com/http/router/system/ping' \
  -H 'content-type: application/json;charset=utf8' \
  -H 'vk-appid: __UNI__XXXXXX' \
  -H 'vk-platform: electron' \
  -d '{"ts": 1700000000000}'
```

预期：

```json
{ "code": 0, "msg": "ok" }
```

### 7.3 在 coolma 里点「测试连接」

`CloudFnConfigDialog.vue` 的"测试连接"按钮调用 `cloud.invoke('system/ping', { ts: Date.now() })`。该接口应在 router 上独立建一个 `service/system/pub/ping.js`：

```js
module.exports = {
  main: async () => ({ code: 0, msg: 'pong', ts: Date.now() })
}
```

### 7.4 看日志

DCloud 后台 → 云函数 → router → 日志，每次请求都会带 `path / httpMethod / multiValueHeaders / requestId`：

```json
{
  "path": "/system/ping",
  "httpMethod": "POST",
  "multiValueHeaders": {
    "vk-platform": ["electron"],
    "vk-appid": ["__UNI__XXXXXX"],
    "uni-id-token": ["..."]
  },
  "requestContext": {
    "requestId": "..."
  }
}
```

## 8. 兼容与切换

### 8.1 切到 lafyun / 自建后端

只动 `src/utils/cloud-router.js`：

| vk 头 | 等价替换 |
|----|----|
| `vk-appid` | 自建侧 `X-App-Id` |
| `vk-platform` | 自建侧不需要，可省 |
| `vk-locale` | 自建侧 `Accept-Language` 已经够 |
| `uni-id-token` | 自建侧 `Authorization: Bearer ...` |

`baseUrl` 改成对应环境的根路径，**业务代码不动**。

### 8.2 双后端并存

控制面走云函数，附件保留 WizNote：v1 接受，参见 `_todo/TODO-云函数调研存档-202607.md` 第 6 节。

v2 再把附件搬到云存储 / 对象存储。

## 9. 常见陷阱

| 现象 | 原因 | 修复 |
|----|----|----|
| 浏览器直接打开 url 触发下载 | url 化形态的 GET 行为就是下载 | 用 POST + curl / Postman |
| `getAppInfo` 报错 | 缺 `vk-appid` / `vk-platform` | 在 `src/utils/cloud-router.js#buildHeaders` 补默认值 |
| `TOKEN_INVALID_ANONYMOUS_USER` 但其实有 token | `vk-locale` / token 头冲突 / 字符集 | 确认 `localStorage.cloudfn.token` 与 `Authorization` 等都干净 |
| 调通一半，cookie 一直失败 | 浏览器 cookie | url 化完全不用 cookie，无需关注 |
| 跨域失败 | baseUrl 域名拼错 | 核对 `<appid>.bspapp.com` 是否正确 |
| 报 `404 Not Found` | `package.json` 没设 `path: /http/router` | 重新上传 router 云函数 |
| token 突然失效但没刷新 | 没读响应里的 `vk_uni_token` | 在 `unwrap` 处增加自动写回逻辑 |

## 10. 参考链接

- DCloud 云函数 url 化外部访问：https://vkdoc.fsq.pub/client/pages/callFunctionForUrl.html
- vk-unicloud axios 调用：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudfunctionsForHttp.html
- vk-unicloud 响应体规范：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/resformat.html
- vk-unicloud 过滤器：https://vkdoc.fsq.pub/client/uniCloud/middleware/filter.html
- vk-unicloud 目录约定：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/catalogue.html
- uni-id-common 概述：https://doc.dcloud.net.cn/uniCloud/uni-id/cloud-common.html
- uni-id 总体：https://doc.dcloud.net.cn/uniCloud/uni-id/summary.html
- 用户 token 机制：https://doc.dcloud.net.cn/uniCloud/uni-id/summary.html#cachepermissionintoken
- 客户端 SDK：https://en.uniapp.dcloud.io/uniCloud/client-sdk.html
- 跨域（CORS 兜底）：尽量不要靠 `webSecurity: false`，先核对 baseUrl 与网关
