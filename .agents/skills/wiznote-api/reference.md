# 为知笔记 API 详细参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充，基于当前 coolma 本地代码整理，用于快速定位 WizNote 相关 HTTP 接口、调用层次与本地同步协作关系。

## API 分层

当前代码中的 WizNote 访问分为三层：

```text
业务层 / 同步层
├── src/store/server/actions.js
├── src/services/SyncService.js
└── src/store/server/localSyncMigration.js
        ↓
接口封装层
└── src/utils/api.js
        ↓
请求执行层
└── boot/request -> execRequest(...)
```

### 关键结论

- `src/utils/api.js` 只负责 HTTP 接口封装，不负责本地落库
- `SyncService` 在 API 之上提供“本地优先”的同步策略
- `store/server/actions.js` 在 API 之上提供 UI / Vuex 业务操作
- 修改 WizNote 接口时，通常要同时检查调用方是否仍匹配

## AccountServerApi 当前能力

### Base URL

默认值：

```javascript
https://as.wiz.cn
```

可通过以下方法切换：

```javascript
api.AccountServerApi.setBaseUrl(url)
```

### 已实现方法

- `getBaseUrl()`
- `setBaseUrl(url)`
- `Login(params)`
- `getUserInfo(params)`
- `getUserAvatar(params)`
- `Logout()`
- `keepTokenAlive()`

### 登录行为的关键副作用

`Login()` 成功后会自动把：

```javascript
KnowledgeBaseBaseUrl = result.kbServer
```

因此登录不仅返回账号信息，还会更新后续知识库接口的目标地址。

补充理解：
- 正常登录流里，通常不需要你在登录成功后再手动 `setBaseUrl(kbServer)`。
- 只有在特殊流程（例如跳过登录、手动恢复某个知识库上下文）下，才可能需要直接设置 `KnowledgeBaseApi` 的 baseUrl。

## KnowledgeBaseApi 当前能力

### Base URL

默认值：

```javascript
https://kshttps0.wiz.cn
```

可通过以下方法切换：

```javascript
api.KnowledgeBaseApi.setBaseUrl(url)
```

### 已实现方法清单

#### 基础配置

- `getBaseUrl()`
- `setBaseUrl(url)`
- `getCacheKey(kbGuid, docGuid)`

#### 文件夹

- `getCategories({ kbGuid })`
- `createCategory({ kbGuid, data })`
- `deleteCategory({ kbGuid, data })`
- `renameCategory({ kbGuid, data })`

#### 笔记

- `getCategoryNotes({ kbGuid, data })`
- `getNoteContent({ kbGuid, docGuid, data })`
- `getNoteInfo({ kbGuid, docGuid, data })`
- `updateNote({ kbGuid, docGuid, data })`
- `updateNoteInfo({ kbGuid, docGuid, data })`
- `copyNote({ kbGuid, docGuid, data })`
- `createNote({ kbGuid, data })`
- `deleteNote({ kbGuid, docGuid })`
- `searchNote({ kbGuid, data })`

#### 资源

- `uploadImage({ kbGuid, docGuid, formData, config })`

#### 标签

- `getTagNotes({ kbGuid, data })`
- `getAllTags({ kbGuid })`
- `getTagNoteCount({ kbGuid, data })`
- `createTag({ kbGuid, data })`
- `renameTag({ kbGuid, data })`
- `moveTag({ kbGuid, data })`
- `deleteTag({ kbGuid, tagGuid })`

## 真实请求路径规律

这些路径都定义在 `src/utils/api.js`。

### 账户侧

- 登录：`POST /as/user/login`
- token 登录：`POST /as/user/login/token`
- 头像：`GET /as/user/avatar/:userGuid`
- 登出：`GET /as/user/logout`
- 保活：`GET /as/user/keep`

### 知识库侧

- 获取分类：`GET /ks/category/all/:kbGuid`
- 分类下笔记：`GET /ks/note/list/category/:kbGuid`
- 下载笔记：`GET /ks/note/download/:kbGuid/:docGuid`
- 笔记信息：`GET /ks/note/info/:kbGuid/:docGuid`
- 更新笔记内容：`PUT /ks/note/save/:kbGuid/:docGuid`
- 更新笔记信息：`POST /ks/note/upload/:kbGuid/:docGuid`
- 复制笔记：`POST /ks/note/copy/:kbGuid/:docGuid`
- 创建笔记：`POST /ks/note/create/:kbGuid`
- 删除笔记：`DELETE /ks/note/delete/:kbGuid/:docGuid`
- 删除分类：`DELETE /ks/category/delete/:kbGuid`
- 重命名分类：`PUT /ks/category/rename/:kbGuid`
- 搜索笔记：`GET /ks/note/search/:kbGuid`
- 上传资源：`POST /ks/resource/upload/:kbGuid/:docGuid`
- 标签笔记：`GET /ks/note/list/tag/:kbGuid`
- 所有标签：`GET /ks/tag/all/:kbGuid`

## 当前最重要的调用关系

## 1. 登录 / 登出

主要在：

- `src/store/server/actions.js`
- `src/store/server/mutations.js`

关键点：

- 登录前可先 `AccountServerApi.setBaseUrl(url)`
- 登录成功后，mutation 会 `KnowledgeBaseApi.setBaseUrl(kbServer)`
- 登出时还会清理旧账号本地数据与状态

## 2. 笔记读取

主要在：

- `src/store/server/actions.js`
- `src/services/SyncService.js`

关键点：

- UI 读取通常先 `getNoteContent()`，并结合缓存 `getCacheKey()`
- 同步层读取云端数据时，常组合 `getNoteInfo()` + `getNoteContent()`
- `getCategoryNotes()` 是列表拉取的主入口，也是同步恢复的基础接口

## 3. 笔记写入

主要在：

- `src/services/SyncService.js`
- `src/store/server/actions.js`

关键点：

- 创建笔记前通常要用 `helper.embedMDNote()` 包装 Markdown
- `updateNote()` 更偏向内容更新
- `updateNoteInfo()` 更偏向标题、分类、标签等 metadata 更新；在当前项目里它也会被用于移动笔记到新分类
- 当前同步架构下，API 成功不等于本地已同步完成，还要更新本地 SQLite 的 `doc_guid / dirty / guid_mapping`

## 4. 分类同步

主要在：

- `src/store/server/actions.js`
- `src/services/SyncService.js`

关键点：

- UI 层创建分类时会直接调用 `createCategory()`
- 同步层会先同步 `local_categories.local_only = 1` 的本地目录
- 目录同步顺序要早于笔记同步，避免云端没有目标目录

## 5. 标签同步

主要在：

- `src/store/server/actions.js`
- `src/store/server/localSyncMigration.js`

关键点：

- `getAllTags()` 用于获取远端标签全集
- `getTagNoteCount()` 是分页累计数，不是原生 count 字段
- 本地标签迁移到云端后，需要把笔记里的本地 tag GUID 替换成云端 tag GUID，并重新标记 `dirty=1`

## 6. 资源上传

主要在：

- `src/store/server/getters.js`
- `src/utils/api.js`
- `src/store/server/actions.js`

关键点：

- 上传地址依赖 `kbGuid + docGuid`
- `uploadImage()` 走 multipart/form-data
- 对于未同步的新笔记，若没有真实云端 `docGuid`，资源上传链路需要额外留意

## 与 helper.js 的协作

`src/utils/helper.js` 中两个方法与 WizNote 强关联：

- `embedMDNote(markdown, resources, options)`
- `extractMarkdownFromMDNote(html, kbGuid, docGuid, resources)`

建议：

- 新建 / 更新云端笔记内容时，优先确认包装格式与当前 API 约定一致
- 下载后回显或恢复 Markdown 时，优先确认解析方法是否仍匹配云端 HTML 结构

## 常见坑点

### 1. Base URL 切换不完整

如果只切了 `AccountServerApi.setBaseUrl(url)`，但没有同步设置 `KnowledgeBaseApi`，后续知识库请求可能落到错误服务器。

### 2. API 成功 ≠ 本地状态完成

例如 `createNote()` 成功后，通常还需要：

- 更新本地 `doc_guid`
- 写入 `guid_mapping`
- 清理 `dirty`

否则本地仍会被当作未同步笔记。

### 3. category 不要随意 normalize 后再上传

在同步层里，`normalizeCategoryForMatch()` 主要用于匹配和去重；真正上传时需要保留原始 category，避免错误改路径。

### 4. `getTagNoteCount()` 不是轻量接口

它会分页遍历标签下所有笔记，可能较慢，不适合高频无缓存调用。

### 5. `kbGuid is not match` 不是普通网络错误

它通常意味着：

- 当前笔记不属于当前知识库
- 或用户切换账号后本地记录仍绑定旧云端信息

出现后应按本地优先策略降级处理，而不是继续强推云端。

## 与其他技能的分工

- 需要理解 HTTP 接口本身：看 `wiznote-api`
- 需要理解本地优先同步策略：看 `sync-design`
- 需要理解笔记落库、local GUID、草稿升级：看 `sync-design` + `notePersistenceService`
- 需要理解 UI / Vuex 如何调用这些接口：看 `src/store/server/actions.js`

## 推荐排查顺序

### 登录失败 / 服务器地址异常

1. `src/utils/api.js`
2. `src/store/server/actions.js`
3. `src/store/server/mutations.js`

### 云端笔记创建或更新异常

1. `src/services/SyncService.js`
2. `src/utils/api.js`
3. `src/utils/helper.js`
4. `src/store/server/notePersistenceService.js`

### 分类 / 标签异常

1. `src/store/server/actions.js`
2. `src/store/server/localSyncMigration.js`
3. `src/utils/api.js`

### 搜索 / 列表 / 下载异常

1. `src/store/server/actions.js`
2. `src/utils/api.js`
3. `src/services/SyncService.js`
