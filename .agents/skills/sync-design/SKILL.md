---
name: sync-design
description: Memocast 离线在线数据同步架构设计指南。用于分析、修改或扩展 coolma 的同步机制，包括本地 SQLite 数据库、IPC 通信、纯本地优先策略、dirty 字段架构、笔记与分类的同步管理、同步预览与恢复。遇到本地优先、dirty 状态、备份到云端、从云端恢复、GUID 映射、离线笔记/分类、数据库落库、同步状态流转，或主进程 IPC 数据链路问题时应自动使用。
---

# 数据同步设计

## 架构概览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         渲染进程 (Renderer)                           │
├──────────────────────────────────────────────────────────────────────┤
│  DatabaseClient.js              │  SyncService.js                   │
│  (IPC 封装层，notes/tags/      │  (备份/恢复核心逻辑)                │
│   categories/sync/runes)        │  backupToCloud / restoreFromCloud  │
│                                  │  CloudSyncService.js (UI 挂载层)  │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │ IPC 通信
┌─────────────────────────────────▼──────────────────────────────────┐
│                          主进程 (Main)                                │
├──────────────────────────────────────────────────────────────────────┤
│                        sql.js SQLite Engine                           │
│  notes | tags | note_tags | local_categories | guid_mapping |        │
│  sync_log | settings | app_state | runes                             │
└──────────────────────────────────────────────────────────────────────┘
```

**核心设计原则：本地优先，云端仅为备份与补回介质，不是协同编辑源。**

## 数据库表结构

### notes 表（主笔记表）

```sql
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_guid TEXT,                    -- 云端文档 GUID，离线笔记以 local_ 开头
  kb_guid TEXT,                    -- 所属知识库 GUID（跨账号隔离）
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT DEFAULT '',
  category TEXT DEFAULT '/',
  tags TEXT DEFAULT '',
  data_created INTEGER,
  data_modified INTEGER,
  local_modified INTEGER,          -- 本地最后修改时间戳
  server_modified INTEGER,         -- 云端最后修改时间戳
  dirty INTEGER DEFAULT 0,         -- 是否待同步（0=已同步，1=待上传）
  created_at INTEGER,
  updated_at INTEGER
)
```

**关键点**：`dirty` 字段替代了已废弃的 `sync_status`。

### tags 表

```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#1890ff',
  created_at INTEGER
)
```

### note_tags 表

```sql
CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
)
```

### local_categories 表（支持离线创建的文件夹）

```sql
CREATE TABLE IF NOT EXISTS local_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL UNIQUE,   -- 完整分类路径，如 '/我的文件夹/'
  parent TEXT DEFAULT '',
  kb_guid TEXT DEFAULT '',         -- 所属知识库
  local_only INTEGER DEFAULT 0,    -- 0=已同步到云端，1=仅本地
  created_at INTEGER,
  updated_at INTEGER
)
```

### guid_mapping 表

```sql
CREATE TABLE IF NOT EXISTS guid_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_id INTEGER NOT NULL,
  server_guid TEXT NOT NULL,
  service TEXT DEFAULT 'wiznote',
  created_at INTEGER,
  UNIQUE(local_id, server_guid),
  FOREIGN KEY (local_id) REFERENCES notes(id) ON DELETE CASCADE
)
```

### sync_log 表

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  direction TEXT NOT NULL CHECK(direction IN ('local_to_server', 'server_to_local')),
  doc_guid TEXT,
  kb_guid TEXT,
  timestamp INTEGER,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
)
```

## 同步状态模型

### dirty 字段（替代 sync_status）

| dirty 值 | 含义 | 流转 |
|---------|------|------|
| `0` | 已同步，无需上传 | → 1（本地修改后） |
| `1` | 待上传，本地有修改 | → 0（上传成功后） |

**注意**：不再有 `conflict`、`pending_download`、`synced` 等状态。冲突在架构上被消灭，不是功能。

### local_only 字段（分类专用）

| local_only 值 | 含义 |
|--------------|------|
| `0` | 已同步到云端 |
| `1` | 仅本地存在，未同步到云端 |

## 同步策略

### 核心原则：本地单主写

- 本地 SQLite 是唯一真实数据源
- 云端是备份库与缺失数据回补来源
- 不做双向时间戳比较，不做 merge
- 不把“线上编辑冲突”当作常态场景

### 三种同步模式

| 方法 | 模式 | 说明 |
|------|------|------|
| `sync()` / `backupToCloud()` | 备份（默认） | 只把本地 dirty=1 的笔记推送到云端，不拉取 |
| `restoreFromCloud()` | 恢复 | 从云端拉取本地不存在的笔记，不推送 |
| `pushOnly()` | 仅推送 | CloudSyncService 专用，只推不拉 |
| `pullOnly()` | 仅拉取 | CloudSyncService 专用，只拉不推 |

### 备份策略（backupToCloud）

```
1. 获取当前账号所有 dirty=1 的笔记（按 kb_guid 过滤，防止跨账号污染）
2. 先把本地独有的目录同步到云端（local_only=1 的分类）
3. 遍历待同步笔记：
   a. 有 doc_guid 且不以 local_ 开头 → 直接更新云端
   b. 无 doc_guid 或以 local_ 开头：
      - 搜索云端同标题+同分类的笔记
      - 找到1个 → 更新那条云端记录
      - 找不到或找到多个 → 在云端创建新笔记
   c. doc_guid 以 local_ 开头但找到云端对应项 → 更新 doc_guid 并关联
4. 同步成功后更新本地 dirty=0
5. 清理已同步的删除日志
```

### 恢复策略（restoreFromCloud）

```
1. 获取云端所有笔记列表（分页）
2. 对每条云端笔记：
   a. 检查本地是否已有非离线 GUID：
      - 有且内容非空 → 跳过
      - 有但内容为空 → 补全内容（backfill）
   b. 检查本地是否有同路径+同标题笔记 → 跳过（永不覆盖本地）
   c. 以上都不满足 → 下载创建新本地记录
3. 不破坏本地已有工作集
```

### 离线笔记 GUID 格式

```javascript
doc_guid: `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
// 例如: local_1717654321000_ab3f2x9q
```

## DatabaseClient API

渲染进程数据库客户端，通过 IPC 调用主进程：

```javascript
import DatabaseClient from 'src/utils/DatabaseClient'

// 笔记 CRUD
DatabaseClient.notes.getAll()                    // 获取所有笔记
DatabaseClient.notes.getById(id)                 // 按 ID 获取
DatabaseClient.notes.getByDocGuid(docGuid)       // 按 doc_guid 获取
DatabaseClient.notes.create(note)                // 创建笔记
DatabaseClient.notes.update(id, updates)         // 更新笔记
DatabaseClient.notes.remove(id)                  // 删除笔记
DatabaseClient.notes.getPendingByKbGuid(kbGuid)  // 获取指定账号的 dirty=1 笔记

// 分类管理
DatabaseClient.categories.getAll()               // 获取所有分类
DatabaseClient.categories.create(params)         // 创建分类
DatabaseClient.categories.remove(category)       // 删除分类
DatabaseClient.categories.syncToCloud(params)    // 将本地分类同步到云端

// 标签
DatabaseClient.tags.getAll()                     // 获取所有标签
DatabaseClient.tags.create(tag)                  // 创建标签

// 同步管理
DatabaseClient.sync.getStats()                   // 获取同步统计
DatabaseClient.sync.createGuidMapping(localId, cloudGuid, source)  // 创建 GUID 映射
DatabaseClient.sync.logPendingDelete({ noteId, docGuid, kbGuid })  // 记录删除待同步

// App 状态
DatabaseClient.appState.get(key)                // 读取 App 状态
DatabaseClient.appState.set(key, value)         // 写入 App 状态
```

## SyncService 核心方法

```javascript
import SyncService from 'src/services/SyncService'

// 默认同步 = 备份
await SyncService.sync()           // 等同 backupToCloud

// 备份（推送本地变更）
await SyncService.backupToCloud()  // 只推不拉

// 恢复（拉取云端笔记）
await SyncService.restoreFromCloud()  // 只拉不推

// 恢复预览（统计将新增/跳过/补全的笔记数）
await SyncService.previewRestoreFromCloud()

// 推送（内部用）
await SyncService.pushToCloud()

// 拉取（内部用）
await SyncService.pullFromCloud()
```

## 冲突处理

**架构决策：不在同步层处理冲突。**

coolma 的模型假设用户主要在本地客户端编辑，云端不承担并行编辑职责。因此：

- 不在 `notes` 表中维护 `conflict` 状态
- 不需要 `conflict_backup` 表
- 不会因为时间戳比较产生"谁覆盖谁"的问题
- 恢复操作永远不覆盖本地已有内容

若出现账户不匹配（如笔记被移动到其他账户）：

```javascript
if (error.message.includes('kbGuid is not match')) {
  // 将笔记降级为本地笔记，清除云端关联
  await DatabaseClient.notes.update(note.id, {
    doc_guid: null,
    dirty: 1
  })
}
```

## 账户隔离

笔记按 `kb_guid` 隔离：

- 每个知识库对应一个 `kb_guid`
- logout 时清理旧账号数据：`deleteByKbGuid`
- login 时隔离旧账号数据：`clearOtherAccounts`
- 待同步笔记按 `kb_guid` 过滤，不跨账号污染

## 离线模式

### 离线笔记

新建笔记时，`doc_guid` 以 `local_` 开头，`kb_guid` 为空，`dirty=1`：

```javascript
// notePersistenceService.js
const docGuid = `local_${Date.now()}_${random}`
const note = await DatabaseClient.notes.create({
  doc_guid: docGuid,
  kb_guid: '',
  title,
  content,
  category: OFFLINE_ROOT_CATEGORY,
  dirty: 1,
  local_modified: now
})
```

### 离线分类

离线创建的文件夹在 `local_categories` 表中，`local_only=1`。上传时先同步这些分类，再同步笔记。

## 相关文件索引

| 文件 | 用途 |
|------|------|
| `src-electron/main-process/electron-main.js` | 数据库初始化、IPC Handlers、迁移逻辑 |
| `src/utils/DatabaseClient.js` | IPC 封装层，渲染进程数据库客户端 |
| `src/services/SyncService.js` | 同步核心逻辑（备份/恢复/pull/push） |
| `src/services/CloudSyncService.js` | UI 层同步服务，状态管理 |
| `src/store/server/notePersistenceService.js` | 笔记持久化操作（创建本地草稿、升级 GUID 等） |
| `src/store/server/localSyncMigration.js` | 离线标签迁移到云端 |
| `src/components/ui/dialog/OfflineSyncPromptDialog.vue` | 离线同步提示弹框 |
| `src/utils/const/constants.js` | `OFFLINE_ROOT_CATEGORY`、`normalizeCategoryForMatch` 等常量 |

## 扩展阅读

详细设计文档见 [reference.md](reference.md)。
