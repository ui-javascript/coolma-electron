# 为知笔记 API 验证指南

## 验证清单

### 账户操作验证
- [ ] 登录成功返回 token、kbGuid、kbServer
- [ ] 登出后 token 失效
- [ ] Token 续期成功

### 笔记 CRUD 验证
- [ ] 创建笔记返回 guid
- [ ] 获取笔记内容包含 html 和 resources
- [ ] 更新笔记后云端内容同步
- [ ] 删除笔记后云端笔记消失

### 文件夹操作验证
- [ ] 创建文件夹后可获取到
- [ ] 重命名后路径更新
- [ ] 删除后文件夹消失

### Markdown 处理验证
- [ ] embedMDNote 正确包装 Markdown
- [ ] extractMarkdownFromMDNote 正确还原 Markdown
- [ ] 资源（图片）hash 正确替换

### 离线同步验证
- [ ] 离线笔记同步到云端根目录
- [ ] 同名笔记（根目录）匹配后更新而非新建
- [ ] 同步后 doc_guid 从 `local_*` 变为真实 GUID

## 测试脚本

### 登录测试
```javascript
const result = await api.AccountServerApi.Login({
  userId: 'test@example.com',
  password: 'password123'
})
console.log('Token:', result.token)
console.log('KbGuid:', result.kbGuid)
```

### 创建并同步笔记
```javascript
const html = helper.embedMDNote('# 测试笔记\n\n内容', [], {
  wrapWithPreTag: false,
  kbGuid,
  docGuid: ''
})

const created = await api.KnowledgeBaseApi.createNote({
  kbGuid,
  data: {
    title: '测试笔记.md',
    owner: userId,
    html,
    type: 'document'
  }
})
console.log('Created guid:', created.guid)

// 下载验证
const content = await api.KnowledgeBaseApi.getNoteContent({
  kbGuid,
  docGuid: created.guid
})
console.log('Content html length:', content.html.length)
```

### 搜索验证
```javascript
const results = await api.KnowledgeBaseApi.searchNote({
  kbGuid,
  data: { ss: '测试' }
})
console.log('Found notes:', results.length)
```

## 常见问题排查

### 问题：createNote 返回 null
**原因**: HTML 内容格式不正确或缺少必填字段

**排查**:
1. 检查 html 是否为空
2. 检查 title 是否提供
3. 检查 kbGuid 是否有效

### 问题：updateNote 不生效
**原因**: 可能触发了文件夹移动/删除逻辑

**排查**:
1. 检查是否传入了 category 字段
2. 只传 html、title、type 字段

### 问题：离线笔记同步后云端找不到
**原因**: 匹配逻辑中 category 规范化不一致

**排查**:
1. 检查 normalizeCategory 函数对两边是否一致
2. 检查匹配时 category 是否规范化
