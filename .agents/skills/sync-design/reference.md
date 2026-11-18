# 数据同步详细设计参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充，基于当前 coolma 本地代码与 `offline-sync-strategy.md` 整理，用于快速定位同步相关的真实实现。

## 当前同步架构总览

### 1. 渲染进程职责

- `src/utils/DatabaseClient.js`
  - 渲染进程访问 SQLite 的唯一入口
  - 按 `notes / tags / sync / categories / appState / runes` 分组封装 IPC
- `src/services/SyncService.js`
  - 核心同步逻辑
  - 默认模式为 `backupToCloud()`
  - 支持 `restoreFromCloud()` 和 `previewRestoreFromCloud()`
- `src/services/CloudSyncService.js`
  - 挂载到设置弹窗云同步面板
  - 负责同步状态、账号信息、监听器和对外 UI 接口
- `src/store/server/notePersistenceService.js`
  - 本地草稿创建、离线导入、local GUID 生成、云端 GUID 回写
- `src/store/server/localSyncMigration.js`
  - 本地标签迁移到云端标签

### 2. 主进程职责

- `src-electron/main-process/electron-main.js`
  - 初始化 sql.js 数据库
  - 负责 schema migration
  - 注册所有数据库 IPC handlers
  - 维护 notes / local_categories / sync_log / guid_mapping 等表

## 关键数据库设计

### notes 表当前关键字段

```sql
notes(
  id,
  doc_guid,
  kb_guid,
  title,
  content,
  category,
  tags,
  data_created,
  data_modified,
  local_modified,
  server_modified,
  dirty,
  created_at,
  updated_at
)
```

### 当前最重要的几个约束

- `sync_status` 已废弃，现已迁移到 `dirty`
- `dirty=1` 表示待上传，本地有修改
- `kb_guid` 用于账号隔离，避免跨账号污染
- `doc_guid LIKE 'local_%'` 表示本地临时 GUID
- 非临时云端笔记通过 `(kb_guid, doc_guid)` 唯一索引约束
- 同路径同标题的唯一性依赖 category/title/kbGuid 语义，而不是单纯随机 GUID

### local_categories 表

```sql
local_categories(
  id,
  category,
  parent,
  kb_guid,
  local_only,
  created_at,
  updated_at
)
```

用途：

- 支持离线创建目录
- 目录同步和笔记同步分离
- `local_only=1` 的目录需要优先同步到云端

### sync_log 表

当前主要用于删除同步日志：

- `action = 'delete'`
- `direction = 'local_to_server'`
- `synced = 1` 后可清理

### guid_mapping 表

用途：

- 本地 ID ↔ 云端 GUID 的映射
- 离线草稿同步成功后回写与幂等校验
- GUID normalization 时优先从该表恢复真实云端 GUID

## 关键迁移逻辑

在 `src-electron/main-process/electron-main.js` 中，已经存在这些重要迁移：

### 1. 引入 `kb_guid`

旧表没有 `kb_guid` 时，会自动补列。

### 2. 引入 `dirty`

旧表没有 `dirty` 时，会自动补列，并启用本地优先同步架构。

### 3. 删除 `sync_status`

如果旧表仍包含 `sync_status`：

- 创建 `notes_new`
- 按旧状态映射出 `dirty`
- 替换旧表
- 重建索引

映射规则：

- `local_only` / `pending_upload` / `conflict` → `dirty = 1`
- 其他 → `dirty = 0`

这说明现在的真实架构已经彻底从“状态机型同步”转向“dirty 型同步”。

## SyncService 真实工作流

## 默认同步：backupToCloud

`sync()` 默认调用：

```javascript
await SyncService.backupToCloud()
```

流程：

1. 检查当前是否登录并拿到 `kbGuid`
2. 清空云端分类缓存
3. 调用 `pushToCloud()`
4. 通知监听器 `sync_start / sync_complete / sync_error`

### pushToCloud 关键行为

- 获取当前账号 `dirty=1` 的笔记：`DatabaseClient.notes.getPendingByKbGuid(kbGuid)`
- 先同步本地独有目录：`syncLocalOnlyCategoriesToCloud(kbGuid)`
- 对每个待同步笔记：
  - 若已有非临时 `doc_guid` → 直接更新云端
  - 若是本地临时 GUID 或无 GUID → 先查云端同分类同标题笔记
  - 查到单条 → 更新并绑定该云端笔记
  - 查不到 / 不稳定 → 创建新云端笔记
- 同步成功后：
  - 更新本地 `doc_guid`
  - 设置 `dirty=0`
  - 写 `guid_mapping`
- 删除操作通过 `sync_log` 单独处理并清理已同步日志

## 手动恢复：restoreFromCloud

恢复不是默认同步的一部分，而是显式恢复入口。

流程：

1. `previewRestoreFromCloud()` 先统计将拉取/跳过/补全的数量
2. `pullFromCloud()` 真正执行
3. 只下载本地不存在的笔记
4. 如果本地已有同路径同标题笔记，直接跳过
5. 如果本地有同 GUID 笔记但内容为空，则 backfill 内容

### previewRestoreFromCloud

返回统计：

```javascript
{
  success: true,
  stats: {
    total,
    pulled,
    skipped,
    backfilled
  }
}
```

### pullFromCloud

内部使用 `_buildRestorePreviewStats({ executeBackfill: true })`：

- `pulled`：新下载创建的笔记数
- `skipped`：本地已存在而跳过的笔记数
- `backfilled`：本地已有空内容笔记，被云端补全内容的数量

## CloudSyncService 真实职责

`src/services/CloudSyncService.js` 不是同步算法本体，而是 UI 服务层：

- 管理 `_status`
  - `isSyncing`
  - `lastSyncTime`
  - `total / synced / pending`
  - `account`
  - `error`
- 对外暴露：
  - `sync()` → `pushOnly()`
  - `pushOnly()`
  - `pullOnly()`
  - `getRestorePreview()`
  - `formatLastSyncTime()`

## DatabaseClient 分组接口

### notes

- `getAll`
- `getById`
- `getByDocGuid`
- `getByDocGuidWithPriority`
- `getAllBasic`
- `create`
- `update`
- `remove`
- `deleteByKbGuid`
- `clearByKbGuid`
- `clearOtherAccounts`
- `getPendingByKbGuid`
- `migrateOffline`

### sync

- `getStats`
- `createGuidMapping`
- `logPendingDelete`
- `getPendingDeleteLogs`
- `markSyncLogSynced`
- `cleanupSyncedDeleteLogs`
- `resetDatabase`

### categories

- `getAll`
- `create`
- `remove`
- `ensureOfflineRoot`
- `syncToCloud`
- `migrateOffline`

## 离线草稿与 GUID 处理

### 本地 GUID 生成

`src/store/server/notePersistenceService.js`：

```javascript
createLocalDocGuid() {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}
```

### 本地草稿提升为云端 GUID

```javascript
promoteLocalDraftToCloudGuid({ localNoteId, docGuid, source })
```

会做两件事：

1. 更新本地 note 的 `doc_guid`
2. 创建 `guid_mapping`

### upsertLocalNoteByDocGuid

用于按云端 GUID 落本地：

- 本地已存在 → update
- 本地不存在 → create

## 离线标签迁移

`src/store/server/localSyncMigration.js` 负责：

1. 读取本地 tags
2. 获取云端 tags
3. 本地标签不存在于云端时自动创建
4. 把使用本地 tag GUID 的笔记改写为云端 tag GUID
5. 修改后的笔记重新标记 `dirty=1`

这说明“标签同步”不是内嵌在主同步循环里，而是一个显式迁移步骤。

## 当前设计中已经消失或弱化的概念

以下内容不应再作为设计事实写入技能：

- `sync_status` 作为主同步状态字段
- `conflict_backup` 表
- 基于 `conflict` 的人工冲突解决流程
- `handleConflicts()` 作为主流程步骤
- “双向同步 / merge-based sync” 表述
- 把云端作为第二主写源

## 仍然需要重点关注的不变量

### 1. 本地优先

- 本地内容一旦存在，不被云端覆盖
- 恢复只补缺，不覆盖
- 上传永远由本地驱动

### 2. 同路径唯一性

- 判断唯一性时关注 `title + normalized category + kb_guid`
- 创建/复制自动生成可读唯一名
- 移动/重命名提前阻止目标路径冲突

### 3. 账号隔离

- 同步、恢复、待同步查询都必须带 `kb_guid`
- 清理旧账号数据时不能误删离线根笔记

### 4. 分类先于笔记同步

- `local_only=1` 的目录必须先同步
- 避免笔记上传时目标目录不存在

## 关键文件定位建议

### 改同步状态、数据库或 IPC

优先看：

1. `src-electron/main-process/electron-main.js`
2. `src/utils/DatabaseClient.js`

### 改备份 / 恢复主逻辑

优先看：

1. `src/services/SyncService.js`
2. `src/services/CloudSyncService.js`

### 改离线导入 / 本地草稿 / GUID 升级

优先看：

1. `src/store/server/notePersistenceService.js`
2. `src/store/server/localSyncMigration.js`

### 改同步 UI / 提示 / 设置弹框

优先看：

1. `src/components/ui/dialog/OfflineSyncPromptDialog.vue`
2. `src/components/ui/dialog/SettingsDialog.vue`
3. `src/i18n/zh-cn/` 与 `src/i18n/en-us/`

## 与 `offline-sync-strategy.md` 的对应关系

当前代码已经基本朝该文档对齐：

- 本地优先：已落实
- 云端只是备份与补回：已落实
- 恢复只补缺，不覆盖：已落实
- 传统冲突状态机：已被淡化或移除
- 同路径唯一性：代码与策略都在强化

但需要持续注意：

- 不要在后续重构中重新引入“云端优先”或“时间戳决策覆盖”
- 不要把恢复逻辑偷偷改回全面 pull + 覆盖
- 不要让标签、分类、笔记三条同步链路再次分叉失控
