---
name: wiznote-api
description: 为知笔记（WizNote）API 集成指南。用于在 Memocast 中调用 WizNote REST API，包括账号登录认证、笔记 CRUD、文件夹管理、标签操作、资源上传、笔记搜索、笔记复制。涵盖 API 调用规范、Token 认证机制、错误处理，以及与本地 SQLite 同步层（SyncService）的协作关系。遇到登录认证、baseUrl、kbGuid、WizNote 接口调用、标签/分类 API、资源上传、笔记元数据更新、搜索，或云端请求链路问题时应自动使用。
---

# 为知笔记 API 操作指南

## 快速参考

### API 入口

```javascript
import api from 'src/utils/api'

// 账户相关
api.AccountServerApi     // 登录、登出、Token 续期、用户信息

// 知识库相关
api.KnowledgeBaseApi      // 笔记、文件夹、标签、资源、搜索
```

### 认证机制

- Token 存储：`ServerFileStorage.getValueFromLocalStorage('token')`
- kbGuid：知识库唯一标识，登录后从响应获取
- 自定义服务器：**登录前**如需切换账户服务地址，可调用 `api.AccountServerApi.setBaseUrl(url)`
- `AccountServerApi.Login()` 成功后会自动把 `KnowledgeBaseBaseUrl` 更新为返回的 `kbServer`
- 仅在“跳过登录但已知目标知识库地址”这类特殊场景下，才需要额外手动调用 `api.KnowledgeBaseApi.setBaseUrl(url)`

### 与同步层的关系

`KnowledgeBaseApi` 是低层 HTTP 接口，`SyncService` 在其之上封装了本地优先同步策略：

```
SyncService (同步逻辑层)
    ↓
KnowledgeBaseApi (WizNote HTTP 接口)
    ↓
execRequest (HTTP 实际请求)
```

不要把 `KnowledgeBaseApi` 的返回值直接当作“已同步”或“已落库”，需要经过 `SyncService` 或 `DatabaseClient` 处理。

## 账户操作 (AccountServerApi)

### 登录

```javascript
await api.AccountServerApi.Login({ userId, password })
// 返回: { token, kbGuid, kbServer, userGuid, ... }
// 注意: kbServer 会自动设置为 KnowledgeBaseBaseUrl
```

### 登出

```javascript
await api.AccountServerApi.Logout()
```

### Token 续期

```javascript
await api.AccountServerApi.keepTokenAlive()
```

### 获取用户信息

```javascript
await api.AccountServerApi.getUserInfo({ token })
```

### 获取用户头像

```javascript
await api.AccountServerApi.getUserAvatar({ userGuid })
```

## 笔记操作 (KnowledgeBaseApi)

### 获取笔记信息（仅 metadata）

```javascript
await api.KnowledgeBaseApi.getNoteInfo({ kbGuid, docGuid })
// 返回: { guid, title, category, dataCreated, dataModified, ... }
```

### 获取笔记内容（下载）

```javascript
await api.KnowledgeBaseApi.getNoteContent({
  kbGuid,
  docGuid,
  data: { downloadInfo: 1, downloadData: 1 }
})
// 返回: { info: {...}, html: '...', resources: [...] }
```

### 获取分类下的笔记列表

```javascript
await api.KnowledgeBaseApi.getCategoryNotes({
  kbGuid,
  data: {
    category: '',        // 空=根目录
    start: 0,
    count: 100,
    withAbstract: true,
    orderBy: 'modified', // or 'created'
    ascending: 'desc'
  }
})
// 返回: [{ guid, title, category, dataCreated, dataModified, ... }]
```

### 创建笔记（需用 embedMDNote 包装内容）

```javascript
import helper from 'src/utils/helper'

const html = helper.embedMDNote(markdownContent, resources, {
  wrapWithPreTag: false,
  kbGuid,
  docGuid: ''
})

await api.KnowledgeBaseApi.createNote({
  kbGuid,
  data: {
    title: '笔记标题',
    category: '/我的文件夹/',
    owner: userId,
    html,
    type: 'document'  // 或 'lite/markdown'
  }
})
// 返回: { guid: '...', returnCode: 200 }
```

### 更新笔记内容

```javascript
await api.KnowledgeBaseApi.updateNote({
  kbGuid,
  docGuid,
  data: {
    html: '更新的内容',
    title: '新标题',
    type: 'document'
  }
})
```

### 更新笔记信息（metadata，可用于标题/分类/标签调整）

```javascript
await api.KnowledgeBaseApi.updateNoteInfo({
  kbGuid,
  docGuid,
  data: {
    title: '新标题',
    tags: 'tag1*tag2',
    category: '/新的文件夹/'
  }
})
```

注意：
- `updateNoteInfo()` 在当前项目里并不只用于改标题，也会用于改分类、改标签。
- 传入 `category` 往往意味着移动笔记到新路径，调用前要明确这是你想要的结果。
- 如果你只是想改标题/标签、不想改变目录，才应避免误传 `category`。

### 删除笔记

```javascript
await api.KnowledgeBaseApi.deleteNote({ kbGuid, docGuid })
```

### 复制笔记

```javascript
await api.KnowledgeBaseApi.copyNote({
  kbGuid,
  docGuid,
  data: {
    targetKbGuid: '目标知识库',
    targetCategory: '/目标文件夹/'
  }
})
```

### 搜索笔记

```javascript
await api.KnowledgeBaseApi.searchNote({
  kbGuid,
  data: { ss: '搜索关键词' }
})
// 返回: [{ guid, title, category, ... }]
```

## 文件夹操作

### 获取文件夹列表

```javascript
await api.KnowledgeBaseApi.getCategories({ kbGuid })
// 返回: { result: [...], pos: [...] }
```

### 创建文件夹

```javascript
await api.KnowledgeBaseApi.createCategory({
  kbGuid,
  data: {
    parent: '/',           // 父文件夹
    child: '文件夹名',
    pos: Date.now().toString()
  }
})
```

### 删除文件夹

```javascript
await api.KnowledgeBaseApi.deleteCategory({
  kbGuid,
  data: { category: '/要删除的文件夹/' }
})
```

### 重命名文件夹

```javascript
await api.KnowledgeBaseApi.renameCategory({
  kbGuid,
  data: {
    category: '/旧路径/',
    newCategory: '/新路径/'
  }
})
```

## 标签操作

### 获取所有标签

```javascript
await api.KnowledgeBaseApi.getAllTags({ kbGuid })
// 返回: [{ tagGuid, name, ... }]
```

### 获取标签下的笔记

```javascript
await api.KnowledgeBaseApi.getTagNotes({
  kbGuid,
  data: {
    tag: tagGuid,
    start: 0,
    count: 100,
    withAbstract: true
  }
})
```

### 获取标签下的笔记数量

```javascript
await api.KnowledgeBaseApi.getTagNoteCount({
  kbGuid,
  data: { tag: tagGuid }
})
// 返回: number
// 注意: 这是当前项目在 api.js 中通过分页拉取标签笔记后累计得到的总数，
// 不是服务端单独提供的轻量 count 字段接口
```

### 创建标签

```javascript
await api.KnowledgeBaseApi.createTag({
  kbGuid,
  data: { name: '标签名', parentTagGuid: '' }
})
```

### 删除标签

```javascript
await api.KnowledgeBaseApi.deleteTag({ kbGuid, tagGuid })
```

### 重命名标签

```javascript
await api.KnowledgeBaseApi.renameTag({
  kbGuid,
  data: {
    tagGuid: '旧标签GUID',
    name: '新标签名'
  }
})
```

### 移动标签

```javascript
await api.KnowledgeBaseApi.moveTag({
  kbGuid,
  data: {
    tagGuid: '要移动的标签GUID',
    parentTagGuid: '新的父标签GUID'
  }
})
```

## 资源上传

### 上传图片

```javascript
const formData = new FormData()
formData.append('file', fileBlob, 'image.png')

await api.KnowledgeBaseApi.uploadImage({
  kbGuid,
  docGuid,
  formData,
  config: { headers: { 'Content-Type': 'multipart/form-data' } }
})
```

## Markdown 处理工具

### embedMDNote - 包装 Markdown 为 HTML

```javascript
import helper from 'src/utils/helper'

const html = helper.embedMDNote(markdownContent, resources, {
  wrapWithPreTag: false,  // true=Lite/Markdown 模式
  kbGuid,
  docGuid: ''  // 创建时为空
})
```

### extractMarkdownFromMDNote - 从 HTML 提取 Markdown

```javascript
const markdown = helper.extractMarkdownFromMDNote(
  htmlContent,
  kbGuid,
  docGuid,
  resources
)
```

## 错误处理

### 常见错误码

- `returnCode !== 200`：API 调用失败
- `kbGuid is not match`：笔记不属于当前知识库
- `externCode`：服务端返回的业务错误码
- 网络错误：请求超时或无法连接

### kbGuid 不匹配处理

当笔记被移动到其他账户时，会收到此错误，应将笔记降级为本地笔记：

```javascript
if (error.message.includes('kbGuid is not match')) {
  // 清除云端关联，降级为本地笔记
  await DatabaseClient.notes.update(note.id, {
    doc_guid: null,
    dirty: 1
  })
}
```

## 相关文件索引

| 文件 | 用途 |
|------|------|
| `src/utils/api.js` | WizNote API 封装层（HTTP 请求） |
| `src/utils/helper.js` | Markdown ↔ HTML 转换工具 |
| `src/services/SyncService.js` | 同步逻辑层，封装 API 与本地优先策略 |
| `src/services/CloudSyncService.js` | UI 层同步状态管理 |
| `src/store/server/actions.js` | Vuex actions，调用 API 封装业务逻辑 |
| `src/store/server/notePersistenceService.js` | 本地草稿创建、GUID 管理 |
| `src/store/server/localSyncMigration.js` | 标签从本地迁移到云端 |

## 扩展阅读

详细设计文档见 [reference.md](reference.md)。
