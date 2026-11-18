---
name: 云函数化与 todo 调研存档
overview: 将当前 WizNote 集成抽象成"云函数 provider"，主路径切到 unicloud + vk-router（云函数 URL 化），资源/上传沿用现有接口形态；同时把 _todo/*.md 中关于本次调研的内容沉淀为一篇博客文档。
todos: []
isProject: false
---

## 目标

1. **本地引入云函数客户端能力**：让 Vue 主项目通过 `vk.callFunction` 调用远端云函数（url 化形态），无需部署整套 unicloud HBuilderX 链。
2. **统一抽象层**：抽出 `CloudFunctionProvider`，把当前直接依赖 `api.js` (`AccountServerApi` / `KnowledgeBaseApi`) 的代码收拢到一处。后续 WizNote 只是其中一个实现。
3. **设置框可配置 baseUrl**：用户在 `SettingsDialog` 内可填 `云函数路由 baseUrl` + `vk-platform` + `appId`，落到 `electron-store` + `localStorage`。
4. **_todo 沉淀成一篇调研存档**：在 `_todo/` 下生成 `TODO-云函数调研存档-202607.md`，结构化记录本次调研结论与后续落地方案。

## 一、本地引入的客户端库

通过 `yarn add` 引入下列 npm 包到主项目（**仅前端**），由 `scripts/build-electron-after.js` 不动，运行时走 `node_modules`：

- **`uni-cloud-router-sdk`**：GitHub 上保持中立、与 unicloud clientDB 解耦的最小客户端库（≈ 6 KB），支持 `vk.callFunction({url, data, isRequest: true})` 形态。
- **fallback 路径**：若暂时拿不到 Vue2 兼容版本，则手写一个 ~80 行的 `src/utils/cloud-router.js`，内含 `callFunction({url, data, headers})`，只做 `fetch` + JWT/Token 注入 + 错误规整 —— **不引入** 整个 VK 源码。

> 选项 (a) 优先尝试 `uni-cloud-router-sdk`，不兼容则走 (b) 手写；选型仅影响"是否引入第三方依赖"，不影响对外接口。

## 二、抽象层：CloudFunctionProvider

新建 `src/services/cloud/CloudFunctionProvider.js`，作为对外唯一入口：

```
// 对外接口（与现有 WizNote 调用同形）
export const cloud = {
  invoke(name, data) { … },
  upload(name, fileOrBlob) { … },
  setConfig({ baseUrl, appId, platform }) { … },
}
```

实现要点：

| 责任 | 内容 |
| --- | --- |
| baseUrl 存储 | `electron-store` key=`cloudfn.baseUrl`；前端 `localStorage` 兜底 |
| AppId / vk-platform | `electron-store` key=`cloudfn.appId`、`cloudfn.platform` |
| Token | key=`cloudfn.token`，登录后写；`callFunction` 自动塞进 `headers.uni-id-token` |
| 默认 header | `vk-appid`、`vk-platform`、`content-type: application/json` |
| 失败处理 | 网络/4xx/5xx 统一抛 `CloudFnError(code, message)`，可选 `needAlert` 弹 `ElMessage.error` |
| 上传 | 当前 `KnowledgeBaseApi.upload(...).data` 形如 `{type, data: blob}`；本层透传到 `POST {baseUrl}/<name>`，body 用 `FormData` |

## 三、设置框新增"云函数"Tab

修改 `src/components/ui/dialog/SettingsDialog.vue`：

- 新增 `cloudFn` tab（紧邻现有 `server` tab），由独立子组件 `CloudFnConfigDialog.vue` 实现（遵循 `vue-dialog-component.mdc`，**独立组件**，不放弹层逻辑到 SettingsDialog 本体）。
- 表单字段：`baseUrl`（input）、`appId`（input）、`platform`（select：`h5/electron/app-plus`）、`token`（password，预留"重新登录获取"按钮）、`测试连接`按钮。
- 改动最小化：不改动现有 WizNote tab，只新增。

## 四、保留 WizNote 资源上传形接口

- 不重写 `KnowledgeBaseApi.attachment/upload`。
- `CloudFunctionProvider` 只接管"用户登录、笔记列表/拉取、笔记创建/更新"这三类调用；
- 资源上传仍走 WizNote，文件元数据落到笔记 JSON 中 `resources[]`。
- 这样 WizNote 当成"附件后端"，云函数为"控制面 + 业务数据"，符合你"先平迁、后面再重写"的诉求。

## 五、_todo 沉淀成一篇

新建 `_todo/TODO-云函数调研存档-202607.md`，结构：

```
# 云函数调研存档（uniCloud + vk-router 路线）

## 1. 调研动机
## 2. 候选方案对比（unicloud / lafyun / 自建）
## 3. 选定方案：unicloud+vk-router url 化
### 3.1 客户端调用形态（vk.callFunction）
### 3.2 单 router 云函数路由模式
### 3.3 前端所需依赖
### 3.4 baseUrl 与 token 在前端落点
## 4. 当前（WizNote）需要替换的部分
### 4.1 src/utils/api.js 中暴露面
### 4.2 src/store/server/actions.js 登录态
### 4.3 设置框位置
## 5. 落地方案（与 plan 对应）
## 6. 风险与缓解
## 7. 后续动作
```

引用本次调研三条 web 搜索结果（DCloud 官方文档、vk-unicloud 文档、lafyun 文档），给出具体可点击 URL，**保留** 我们下一阶段切换/回退的决策点。

## 关键文件清单

| 用途 | 路径 | 动作 |
| --- | --- | --- |
| 客户端入口 | `src/services/cloud/CloudFunctionProvider.js` | **新增** |
| 默认 baseUrl 模块 | `src/utils/cloud-router.js` | **新增**（选型 b 路径时） |
| 设置子组件 | `src/components/ui/dialog/CloudFnConfigDialog.vue` | **新增** |
| 父组件 | `src/components/ui/dialog/SettingsDialog.vue` | **新增 1 个 tab** + 引入子组件 |
| 调研存档 | `_todo/TODO-云函数调研存档-202607.md` | **新增** |
| `package.json` | 根 | 选择性 `yarn add uni-cloud-router-sdk` 或不加 |

## 边界与不回退项

- **不动** `_plugins/` 任何子项目；本计划只在主项目作用域。
- **不动** Quasar 配置、`scripts/build-electron-after.js`、`src-electron/main-process/` 数据库层（`DatabaseClient.js` 50+ 个 `db:*` channel 全部保留）。
- **不动** WizNote 资源上传接口、不动 `KnowledgeBaseApi.upload`。
- **不引入** unicloud-clientDB（避免 lock-in）；本次只取 `vk.callFunction({isRequest:true})` 形态。
- 落点：仅"调用层"，云端 `router` 云函数的实际部署不在本次范围。