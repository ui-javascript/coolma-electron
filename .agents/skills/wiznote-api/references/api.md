# 为知笔记 API 详细参考

## API 端点列表

### 账户服务器 (AccountServerApi)

| 方法 | HTTP | 端点 | 说明 |
|------|------|------|------|
| Login | POST | `/as/user/login` | 用户登录 |
| Logout | GET | `/as/user/logout` | 登出 |
| getUserInfo | POST | `/as/user/login/token` | Token 登录 |
| getUserAvatar | GET | `/as/user/avatar/:userGuid` | 获取头像 |
| keepTokenAlive | GET | `/as/user/keep` | 续期 Token |

### 知识库服务器 (KnowledgeBaseApi)

#### 笔记操作

| 方法 | HTTP | 端点 | 说明 |
|------|------|------|------|
| getCategoryNotes | GET | `/ks/note/list/category/:kbGuid` | 获取文件夹下笔记 |
| getNoteInfo | GET | `/ks/note/info/:kbGuid/:docGuid` | 获取笔记信息 |
| getNoteContent | GET | `/ks/note/download/:kbGuid/:docGuid` | 下载笔记内容 |
| createNote | POST | `/ks/note/create/:kbGuid` | 创建笔记 |
| updateNote | PUT | `/ks/note/save/:kbGuid/:docGuid` | 更新笔记内容 |
| updateNoteInfo | POST | `/ks/note/upload/:kbGuid/:docGuid` | 更新笔记信息 |
| deleteNote | DELETE | `/ks/note/delete/:kbGuid/:docGuid` | 删除笔记 |
| copyNote | POST | `/ks/note/copy/:kbGuid/:docGuid` | 复制笔记 |
| searchNote | GET | `/ks/note/search/:kbGuid` | 搜索笔记 |

#### 文件夹操作

| 方法 | HTTP | 端点 | 说明 |
|------|------|------|------|
| getCategories | GET | `/ks/category/all/:kbGuid` | 获取所有文件夹 |
| createCategory | POST | `/ks/category/create/:kbGuid` | 创建文件夹 |
| deleteCategory | DELETE | `/ks/category/delete/:kbGuid` | 删除文件夹 |
| renameCategory | PUT | `/ks/category/rename/:kbGuid` | 重命名文件夹 |

#### 标签操作

| 方法 | HTTP | 端点 | 说明 |
|------|------|------|------|
| getAllTags | GET | `/ks/tag/all/:kbGuid` | 获取所有标签 |
| getTagNotes | GET | `/ks/note/list/tag/:kbGuid` | 获取标签下笔记 |
| createTag | POST | `/ks/tag/create/:kbGuid` | 创建标签 |
| renameTag | PUT | `/ks/tag/rename/:kbGuid` | 重命名标签 |
| moveTag | PUT | `/ks/tag/move/:kbGuid` | 移动标签 |
| deleteTag | DELETE | `/ks/tag/delete/:kbGuid/:tagGuid` | 删除标签 |

#### 资源操作

| 方法 | HTTP | 端点 | 说明 |
|------|------|------|------|
| uploadImage | POST | `/ks/resource/upload/:kbGuid/:docGuid` | 上传图片 |

## API 响应格式

### 成功响应
```javascript
// execRequest 自动解包，返回 result 字段
{
  returnCode: 200,
  returnMessage: "OK",
  result: { /* 实际数据 */ }
}
```

### 错误响应
```javascript
{
  returnCode: 500,  // 或其他错误码
  returnMessage: "错误描述"
}
```

## 笔记对象结构

### 笔记信息 (from getCategoryNotes)
```javascript
{
  guid: "笔记GUID",
  title: "笔记标题.md",
  category: "/文件夹路径/",
  dataCreated: 1234567890000,
  dataModified: 1234567890000,
  tags: "tag1*tag2",  // 用 * 分隔
  // ...
}
```

### 笔记内容 (from getNoteContent)
```javascript
{
  info: { /* 笔记元信息 */ },
  html: "<div class='wiz-note-body'>...</div>",
  resources: [
    {
      hash: "资源hash",
      name: "image.png",
      size: 12345,
      // ...
    }
  ]
}
```

### HTML 内容结构
```html
<div class="wiz-note-body">
  <div class="wiz-note-html">
    <!-- 实际笔记内容 -->
  </div>
  <pre class="wiz-note-document-info" style="display:none">
    {"document":{"title":"...","guid":"...","kbGuid":"..."}}
  </pre>
</div>
```

## Category 路径规范

| 类型 | 示例 | 说明 |
|------|------|------|
| 根目录 | `""` 或不传 | 根目录笔记 |
| 子文件夹 | `/工作/` | 根目录下 |
| 深层目录 | `/工作/项目A/` | 多级目录 |
| 离线根目录 | `/我的笔记/` | 离线模式专用 |

## 类型 (type) 字段

| type | 说明 |
|------|------|
| `document` | 普通文档 |
| `lite/markdown` | Markdown 轻量文档 |

## 认证 Header

```javascript
headers: {
  'X-Wiz-Token': token  // 从 ServerFileStorage 获取
}
```

## 分页参数

| 参数 | 类型 | 说明 |
|------|------|------|
| start | int | 起始位置 |
| count | int | 每页数量 |
| withAbstract | bool | 是否返回摘要 |

## 排序参数

| 参数 | 值 | 说明 |
|------|------|------|
| orderBy | `modified` | 按修改时间 |
| orderBy | `created` | 按创建时间 |
| ascending | `asc` | 升序 |
| ascending | `desc` | 降序 |
