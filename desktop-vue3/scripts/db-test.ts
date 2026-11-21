/**
 * 仓储层可执行测试（不依赖 Electron）：node:sqlite 内存库 + 真实 migration + 真实仓储代码。
 *
 * 跑法：node -e "require('esbuild').buildSync({...})" && node /tmp/db-test.js
 */
import { createNodeSqliteDatabase } from './db-node-adapter';
import { setDatabase } from '../electron/service/db/connection';
import { runMigrations } from '../electron/service/db/migrations';
import { notesRepository } from '../electron/service/db/notes-repository';
import { categoriesRepository } from '../electron/service/db/categories-repository';
import { tagsRepository } from '../electron/service/db/tags-repository';
import { settingsRepository } from '../electron/service/db/settings-repository';
import { runesRepository, echoesRepository } from '../electron/service/db/library-repository';
import { syncBuiltinCatalog } from '../electron/service/db/builtins';
import { templatesRepository } from '../electron/service/db/templates-repository';
import { previewImport, commitImport } from '../electron/service/packs-service';
import { aiModelsRepository, aiSkillsRepository } from '../electron/service/db/ai-repository';
import { getDatabase } from '../electron/service/db/connection';
import { syncLogRepository } from '../electron/service/db/sync-log-repository';
import { runIntegrityCheck } from '../electron/service/db/diagnostics';
import { backupFileName, isManagedBackupFile, listBackups, pruneBackups } from '../electron/service/db/backup-files';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let failed = 0;

function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`OK   ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ''}`);
}

const handle = createNodeSqliteDatabase(':memory:');
setDatabase(handle.database);
const schemaVersion = runMigrations(handle.database);

// ===== 迁移 =====
assert('迁移：version 走到 6', schemaVersion === 6, String(schemaVersion));
const tables = handle.database
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((row: { name: string }) => row.name);
assert('迁移：核心表齐全', ['notes', 'tags', 'note_tags', 'local_categories', 'sync_log', 'runes', 'echoes', 'settings'].every((t) => tables.includes(t)), tables.join(','));

// ===== 内置符文/回响播种 =====
const runes = runesRepository.list();
const echoes = echoesRepository.list();
assert('播种：内置符文 >0', runes.length > 0, String(runes.length));
assert('播种：内置回响 >0', echoes.length > 0, String(echoes.length));
assert('播种：符文带 id 与名称', Boolean(runes[0]?.id && runes[0]?.name), JSON.stringify(runes[0]));
assert('符文/回响：内置示例不可删除',
  !runesRepository.remove('builtin-rune-counter') && !echoesRepository.remove('__builtin_nice__')
    && runesRepository.list().some((item) => item.id === 'builtin-rune-counter')
    && echoesRepository.list().some((item) => item.id === '__builtin_nice__'));
assert('播种：vue2 内置回响 17 张', echoes.filter((item) => item.id.startsWith('__builtin_')).length === 17, String(echoes.length));
assert('播种：v3 demo 占位卡已清掉', !echoes.some((item) => item.id === 'builtin-echo-demo'), JSON.stringify(echoes.map((item) => item.id)));
// 通用对账：catalog 里没有的 __builtin_* 行，启动时会被清掉；用户卡片不受影响。
handle.database.prepare(
  `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
   VALUES ('__builtin_obsolete__', 'obsolete', '', '#000', 'block', 'export default {}', 'anno', 'builtin', 99, ?, ?)`,
).run(Date.now(), Date.now());
const userEcho = echoesRepository.save({ id: 'e-keep-1', name: '保留卡片', annoSource: 'export default {}' });
// 改坏一张内置卡，再对账应被 JSON 内容覆盖回来（内置项只读，系统说了算）。
handle.database.prepare("UPDATE echoes SET name = '被改坏' WHERE id = '__builtin_nice__'").run();
syncBuiltinCatalog(handle.database);
assert(
  '内置目录：过期内置被清、用户卡片保留、内置内容回正',
  !echoesRepository.list().some((item) => item.id === '__builtin_obsolete__')
    && echoesRepository.list().some((item) => item.id === userEcho.id)
    && echoesRepository.list().filter((item) => item.id.startsWith('__builtin_')).length === 17
    && echoesRepository.list().find((item) => item.id === '__builtin_nice__')?.name === 'nice',
  '',
);

// ===== 笔记创建与唯一标题 =====
const first = notesRepository.create({ title: '测试笔记', content: 'hello', category: '/工作' });
assert('笔记：创建返回自增 id', first.id > 0, String(first.id));
assert('笔记：默认 dirty=1', first.dirty === 1, String(first.dirty));
const second = notesRepository.create({ title: '测试笔记', content: 'dup', category: '/工作' });
assert('笔记：同名自动去重', second.title === '测试笔记 (2)', second.title);
const elsewhere = notesRepository.create({ title: '测试笔记', content: 'other', category: '/生活' });
assert('笔记：跨分类不撞名', elsewhere.title === '测试笔记', elsewhere.title);
const onlineNote = notesRepository.create({ title: '在线笔记', content: 'online', category: '/工作', kbGuid: 'kb-1' });
assert('笔记：在线创建带当前账号', onlineNote.kbGuid === 'kb-1', String(onlineNote.kbGuid));

// 拉取去重：分类 + 标题 + 当前账号（NULL 归当前）
const matchedLocal = notesRepository.findByTitleCategory({ category: '/工作', title: first.title, kbGuid: 'kb-1' });
assert('拉取去重：同目录同标题命中', matchedLocal?.id === first.id, JSON.stringify(matchedLocal));
assert(
  '拉取去重：不同目录不命中',
  notesRepository.findByTitleCategory({ category: '/生活', title: '测试笔记 (2)', kbGuid: 'kb-1' }) === null,
  'category differs',
);

// ===== 列表与 LIKE 转义 =====
const percent = notesRepository.create({ title: '100% 覆盖', content: 'x', category: '/工作' });
const listAll = notesRepository.list({ category: '/工作' });
assert('列表：分类过滤只回本类', listAll.items.every((n) => n.category === '/工作'), JSON.stringify(listAll.items.map((n) => n.title)));
const queryPercent = notesRepository.list({ query: '100%' });
assert('列表：% 被转义为字面量', queryPercent.items.length === 1 && queryPercent.items[0].id === percent.id, String(queryPercent.total));
const queryNone = notesRepository.list({ query: '%' });
assert('列表：单 % 不匹配全部', queryNone.items.length === 1, String(queryNone.total));

// ===== 更新与 sync_log 折叠 =====
const pendingBefore = syncLogRepository.summary().total;
notesRepository.update(first.id, { content: 'hello v2' });
const pendingAfter = syncLogRepository.summary().total;
assert('队列：create 已记一条', pendingBefore >= 1, String(pendingBefore));
assert('队列：二次 update 折叠不新增', pendingAfter === pendingBefore, `${pendingBefore} -> ${pendingAfter}`);
const pendingList = syncLogRepository.listPending();
const firstRows = pendingList.filter((e) => e.noteId === first.id);
assert('队列：本地笔记只有一行且保持 create 语义', firstRows.length === 1 && firstRows[0].action === 'create', JSON.stringify(firstRows));

// ===== 删除与级联 =====
const removed = notesRepository.remove(second.id);
assert('删除：返回 true', removed);
assert('删除：记录已不存在', notesRepository.get(second.id) === null);
const afterRemovePending = syncLogRepository.listPending();
assert('删除：本地笔记不写 delete 行（服务端本来就没有）', afterRemovePending.every((e) => e.action !== 'delete'), JSON.stringify(afterRemovePending.map((e) => e.action)));

// 服务端笔记（doc_guid 不是 local_ 前缀）删除时才需要通知服务端
const serverNoteId = Number(
  handle.database
    .prepare(
      `INSERT INTO notes (doc_guid, kb_guid, title, content, category, tags, created_at, updated_at, dirty)
       VALUES (?, ?, '服务端笔记', '', '/工作', '', ?, ?, 1)`,
    )
    .run('server-guid-1', 'kb-1', Date.now(), Date.now()).lastInsertRowid,
);
notesRepository.remove(serverNoteId);
const deleteRows = syncLogRepository.listPending().filter((e) => e.action === 'delete');
assert('删除：服务端笔记写 delete', deleteRows.length === 1, JSON.stringify(deleteRows));
assert('删除：delete 行 note_id 为空', deleteRows[0]?.noteId === null, JSON.stringify(deleteRows[0]));

// ===== markSynced =====
const targetIds = syncLogRepository.listPending().slice(0, 2).map((e) => e.id);
const marked = syncLogRepository.markSynced(targetIds);
assert('队列：markSynced 生效', marked === targetIds.length, `${marked}/${targetIds.length}`);
const afterMark = syncLogRepository.summary().total;
assert('队列：水位下降', afterMark === pendingAfter - targetIds.length, `${pendingAfter} -> ${afterMark}`);

// ===== 删除日志专用查询 & 销账 =====
const pendingDeletes = syncLogRepository.listPendingDeletes();
assert(
  '删除日志：listPendingDeletes 只回 delete',
  pendingDeletes.length > 0 && pendingDeletes.every((entry) => entry.action === 'delete'),
  JSON.stringify(pendingDeletes.map((entry) => entry.action)),
);
syncLogRepository.markSynced([pendingDeletes[0].id]);
syncLogRepository.purgeSyncedDeletes();
const afterPurge = syncLogRepository.listPendingDeletes();
assert('删除日志：purge 后不再残留已同步行', afterPurge.length === pendingDeletes.length - 1, String(afterPurge.length));
assert(
  '删除日志：按账号过滤，别的账号不串',
  syncLogRepository.listPendingDeletes(200, 'kb-1').length === afterPurge.length
    && syncLogRepository.listPendingDeletes(200, 'other-kb').length === 0,
  JSON.stringify({
    kb1: syncLogRepository.listPendingDeletes(200, 'kb-1').length,
    other: syncLogRepository.listPendingDeletes(200, 'other-kb').length,
  }),
);

// 单篇笔记推送成功后的日志销账
const markNoteTest = notesRepository.create({ category: '/工作', title: '日志销账' });
const beforeNoteMark = syncLogRepository.listPending().filter((entry) => entry.noteId === markNoteTest.id).length;
const noteMarked = syncLogRepository.markNoteSynced(markNoteTest.id);
assert('队列：markNoteSynced 清掉本篇日志', beforeNoteMark > 0 && noteMarked === beforeNoteMark, `${beforeNoteMark} -> ${noteMarked}`);
assert(
  '队列：markNoteSynced 不影响别的笔记',
  syncLogRepository.listPending().every((entry) => entry.noteId !== markNoteTest.id),
  JSON.stringify(syncLogRepository.listPending().map((entry) => entry.noteId)),
);

// ===== 待推送账号过滤 =====
const otherAccountNoteId = Number(
  handle.database
    .prepare(
      `INSERT INTO notes (doc_guid, kb_guid, title, content, category, tags, created_at, updated_at, dirty)
       VALUES ('other-guid', 'other-kb', '别的账号', '', '/工作', '', ?, ?, 1)`,
    )
    .run(Date.now(), Date.now()).lastInsertRowid,
);
const scopedDirty = notesRepository.listDirty(50, 'kb-1');
assert(
  '待推送：不含别的账号',
  !scopedDirty.some((note) => note.id === otherAccountNoteId),
  JSON.stringify(scopedDirty.map((note) => `${note.id}:${note.kbGuid}`)),
);
assert(
  '待推送：保留当前账号与未归属笔记',
  scopedDirty.every((note) => note.kbGuid === 'kb-1' || !note.kbGuid)
    && scopedDirty.some((note) => !note.kbGuid),
  JSON.stringify(scopedDirty.map((note) => `${note.id}:${note.kbGuid}`)),
);

// ===== 登录后离线笔记迁移 =====
const offlineMoved = notesRepository.migrateOffline('kb-2');
assert('迁移：离线笔记数量 > 0', offlineMoved > 0, String(offlineMoved));
assert(
  '迁移：离线笔记归属当前账号且保持 dirty',
  notesRepository.get(first.id)?.kbGuid === 'kb-2' && notesRepository.get(first.id)?.dirty === 1,
  JSON.stringify(notesRepository.get(first.id)),
);
assert(
  '迁移：别的账号笔记不被动',
  notesRepository.get(otherAccountNoteId)?.kbGuid === 'other-kb',
  JSON.stringify(notesRepository.get(otherAccountNoteId)),
);

// ===== 分类 =====
const category = categoriesRepository.create({ category: '/工作/子目录' });
assert('分类：创建返回节点', Boolean(category?.category), JSON.stringify(category));
assert('分类：countNotes 统计', categoriesRepository.countNotes('/工作') >= 1, String(categoriesRepository.countNotes('/工作')));
assert('分类：根目录不可删', categoriesRepository.remove('/') === false);
const nonEmptyCategory = categoriesRepository.create({ category: '/非空删除' });
const keptNote = notesRepository.create({ title: '目录删了还在', content: 'keep', category: '/非空删除' });
assert(
  '分类：非空目录可删（照 vue2 只删节点）',
  categoriesRepository.remove(nonEmptyCategory.category) === true,
  nonEmptyCategory.category,
);
assert(
  '分类：删目录不动笔记',
  notesRepository.get(keptNote.id)?.category === '/非空删除',
  JSON.stringify(notesRepository.get(keptNote.id)),
);
assert('分类：parentOf 解析', categoriesRepository.parentOf('/工作/子目录') === '/工作', categoriesRepository.parentOf('/工作/子目录'));

const offlineCategory = categoriesRepository.create({
  category: '/离线目录/子目录',
  kbGuid: 'kb-1',
  localOnly: true,
});
assert('分类：离线创建标 local_only=1', offlineCategory.localOnly === 1, JSON.stringify(offlineCategory));
assert(
  '分类：listLocalOnly 只回待补建目录',
  categoriesRepository.listLocalOnly('kb-1').every((item) => item.localOnly === 1 && item.kbGuid === 'kb-1'),
  JSON.stringify(categoriesRepository.listLocalOnly('kb-1')),
);
assert(
  '分类：listLocalOnly 能命中离线目录',
  categoriesRepository.listLocalOnly('kb-1').some((item) => item.category === '/离线目录/子目录'),
  JSON.stringify(categoriesRepository.listLocalOnly('kb-1').map((item) => item.category)),
);
assert('分类：markSynced 返回命中', categoriesRepository.markSynced('/离线目录/子目录', 'kb-1') === true);
assert(
  '分类：markSynced 后移出待补建',
  !categoriesRepository.listLocalOnly('kb-1').some((item) => item.category === '/离线目录/子目录'),
  JSON.stringify(categoriesRepository.listLocalOnly('kb-1').map((item) => item.category)),
);

const offlineCategory2 = categoriesRepository.create({ category: '/离线二', localOnly: true });
assert('分类：离线创建默认空账号', offlineCategory2.kbGuid === '', JSON.stringify(offlineCategory2));
const movedCategories = categoriesRepository.migrateOffline('kb-2');
assert('分类：迁移返回命中数量', movedCategories > 0, String(movedCategories));
assert(
  '分类：迁移后归属当前账号',
  categoriesRepository.list().find((item) => item.category === '/离线二')?.kbGuid === 'kb-2',
  JSON.stringify(categoriesRepository.list().find((item) => item.category === '/离线二')),
);

// ===== 登出解除账号归属（不删数据）=====
const detachedNotes = notesRepository.detachFromKb('kb-1');
assert('登出：解除归属数量 > 0', detachedNotes > 0, String(detachedNotes));
assert(
  '登出：笔记 kb_guid 置空且标脏',
  notesRepository.get(onlineNote.id)?.kbGuid === null && notesRepository.get(onlineNote.id)?.dirty === 1,
  JSON.stringify(notesRepository.get(onlineNote.id)),
);
assert(
  '登出：别的账号笔记不被动',
  notesRepository.get(otherAccountNoteId)?.kbGuid === 'other-kb',
  JSON.stringify(notesRepository.get(otherAccountNoteId)),
);
const detachedCategories = categoriesRepository.detachFromKb('kb-2');
assert('登出：目录解除归属数量 > 0', detachedCategories > 0, String(detachedCategories));
assert(
  '登出：目录退回离线且保留 local_only',
  categoriesRepository.list().find((item) => item.category === '/离线二')?.kbGuid === ''
    && categoriesRepository.list().find((item) => item.category === '/离线二')?.localOnly === 1,
  JSON.stringify(categoriesRepository.list().find((item) => item.category === '/离线二')),
);

// ===== 标签 =====
const tag = tagsRepository.create('紧急');
assert('标签：创建成功', tag.name === '紧急', JSON.stringify(tag));
assert('标签：样式有默认色', typeof tag.color === 'string' && tag.color.length > 0, tag.color);
assert('标签：删除生效', tagsRepository.remove(tag.id) === true);

// ===== 设置 =====
settingsRepository.set('theme', { mode: 'dark' });
assert('设置：对象往返', (settingsRepository.get('theme') as { mode: string }).mode === 'dark');
assert('设置：删除生效', settingsRepository.remove('theme') === true && settingsRepository.get('theme') === null, String(settingsRepository.get('theme')));

// ===== 体检 =====
const report = runIntegrityCheck();
assert('体检：有 issues 结构', Array.isArray(report.issues), JSON.stringify(Object.keys(report)));
assert('体检：healthy 是布尔', typeof report.healthy === 'boolean', JSON.stringify(report).slice(0, 120));
assert('体检：干净库不报 TAG_STRING_WITHOUT_LINKS', report.issues.every((issue) => issue.kind !== 'TAG_STRING_WITHOUT_LINKS'), JSON.stringify(report.issues.map((i) => i.kind)));

// 人为制造脏数据：notes.tags 有值但 note_tags 没有对应行，体检必须抓到
handle.database
  .prepare(
    `INSERT INTO notes (doc_guid, kb_guid, title, content, category, tags, created_at, updated_at, dirty)
     VALUES ('dirty-guid', 'kb-1', '脏笔记', '', '/工作', '孤立标签', ?, ?, 1)`,
  )
  .run(Date.now(), Date.now());
const dirtyReport = runIntegrityCheck();
assert('体检：能抓到 tags 与 note_tags 不一致', dirtyReport.issues.some((issue) => issue.kind === 'TAG_STRING_WITHOUT_LINKS'), JSON.stringify(dirtyReport.issues.map((i) => `${i.kind}:${i.count}`)));

// ===== 标签一致性治理（notes.tags 字符串为准，note_tags 是派生索引）=====
{
  // 制造漂移：字符串是「甲,乙」，但关系表只连了「甲」
  // （注意：TAG_DRIFT 的定义是「两边都有，但集合不同」；只剩一边会被归到另两类问题）
  const driftNote = notesRepository.create({ title: '漂移笔记', content: '', category: '/工作', tags: '甲,乙' });
  handle.database
    .prepare('DELETE FROM note_tags WHERE note_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)')
    .run(driftNote.id, '乙');
  const driftedReport = runIntegrityCheck();
  assert('标签治理：先制造出 TAG_DRIFT', driftedReport.issues.some((i) => i.kind === 'TAG_DRIFT'), JSON.stringify(driftedReport.issues.map((i) => i.kind)));

  const synced = tagsRepository.syncFromNotes();
  assert('标签治理：重建后有连接', synced.links >= 2, JSON.stringify(synced));
  const afterSync = runIntegrityCheck();
  assert('标签治理：重建后 TAG_DRIFT 消失', afterSync.issues.every((i) => i.kind !== 'TAG_DRIFT'), JSON.stringify(afterSync.issues.map((i) => i.kind)));
  const again = tagsRepository.syncFromNotes();
  assert('标签治理：重建幂等（不重复加标签）', again.tagsAdded === 0, JSON.stringify(again));

  // 删除标签必须同时从字符串里摘掉，否则会留下幽灵标签
  const ghostTagId = tagsRepository.create('幽灵', '#ff0000').id;
  notesRepository.update(driftNote.id, { tags: '甲,乙,幽灵' });
  const beforeRemove = notesRepository.get(driftNote.id);
  assert('标签治理：删除前字符串含幽灵', beforeRemove?.tags === '甲,乙,幽灵', beforeRemove?.tags);
  tagsRepository.remove(ghostTagId);
  const afterRemove = notesRepository.get(driftNote.id);
  assert('标签治理：删除后字符串不再含幽灵', afterRemove?.tags === '甲,乙', afterRemove?.tags);
  const linksAfterRemove = handle.database
    .prepare('SELECT COUNT(*) AS c FROM note_tags WHERE note_id = ?')
    .get(driftNote.id) as { c: number };
  assert('标签治理：删除后关系表同步收缩', Number(linksAfterRemove.c) === 2, String(linksAfterRemove.c));
  const finalReport = runIntegrityCheck();
  assert('标签治理：治理后整体一致', finalReport.issues.every((i) => i.kind !== 'TAG_DRIFT' && i.kind !== 'TAG_STRING_WITHOUT_LINKS'), JSON.stringify(finalReport.issues.map((i) => i.kind)));
}

// ===== 备份命名 / 列表 / 保留策略（纯文件系统逻辑，不碰 better-sqlite3）=====
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coolma-backup-'));

  assert('备份：文件名形状可识别', isManagedBackupFile('coolma-2026-01-02T03-04-05-678Z.db'), backupFileName('coolma', new Date('2026-01-02T03:04:05.678Z')));
  assert('备份：pre-restore 可识别', isManagedBackupFile('pre-restore-2026-01-02T03-04-05-678Z.db'));
  assert('备份：外部文件不算托管备份', isManagedBackupFile('my-notes.db') === false);
  assert('备份：非 db 后缀不算', isManagedBackupFile('coolma-2026.db.bak') === false);

  // 造 10 份 manual + 1 份 pre-restore + 1 个外来文件
  for (let i = 0; i < 10; i += 1) {
    const name = `coolma-2026-01-0${i + 1}T00-00-00-000Z.db`;
    fs.writeFileSync(path.join(dir, name), 'x');
    fs.utimesSync(path.join(dir, name), new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`), new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
  }
  fs.writeFileSync(path.join(dir, 'pre-restore-2026-02-01T00-00-00-000Z.db'), 'y');
  fs.writeFileSync(path.join(dir, 'user-own.db'), 'z');

  const entries = listBackups(dir);
  assert('备份：列表只含托管文件', entries.length === 11, String(entries.length));
  assert('备份：按时间倒序', entries[0].name.startsWith('pre-restore'), entries[0]?.name);
  assert('备份：kind 分类正确', entries.filter((e) => e.kind === 'manual').length === 10, String(entries.filter((e) => e.kind === 'manual').length));

  const removed = pruneBackups(3, dir);
  assert('备份：保留 3 份手动备份', removed.length === 7, String(removed.length));
  const left = listBackups(dir);
  assert('备份：pre-restore 不被清理', left.some((e) => e.kind === 'pre-restore'), JSON.stringify(left.map((e) => e.name)));
  assert('备份：外来文件不被清理', fs.existsSync(path.join(dir, 'user-own.db')));
  assert('备份：剩余手动备份为最新 3 份', left.filter((e) => e.kind === 'manual').length === 3, String(left.filter((e) => e.kind === 'manual').length));

  fs.rmSync(dir, { recursive: true, force: true });
}

// ===== 符文/回响 CRUD（对齐 vue2 saveRune/saveEcho 语义）=====
{
  const runeA = runesRepository.save({ id: 'r-custom-1', name: '我的符文', desc: '说明', template: '<template><b>x</b></template>' });
  assert('符文：保存返回完整卡片', runeA.id === 'r-custom-1' && runeA.template === '<template><b>x</b></template>', JSON.stringify(runeA));
  assert('符文：默认色与图标', runeA.color === '#7E57C2' && runeA.icon === 'auto_awesome');
  assert('符文：默认分类 general', runeA.category === 'general');

  const runeUpd = runesRepository.save({ id: 'r-custom-1', name: '我的符文', desc: '改过了', sortOrder: 5 });
  assert('符文：同名 id 自身放行（upsert）', runeUpd.desc === '改过了' && runeUpd.sortOrder === 5, JSON.stringify(runeUpd));

  let runeDup = '';
  try { runesRepository.save({ id: 'r-custom-2', name: '我的符文' }); } catch (e) { runeDup = String((e as Error).message); }
  assert('符文：大小写不敏感重名拒绝', runeDup.includes('RUNE_DUPLICATE_NAME'), runeDup);
  try { runesRepository.save({ id: 'r-custom-2', name: '  我的符文  ' }); runeDup = 'saved'; } catch (e) { runeDup = String((e as Error).message); }
  assert('符文：trim 后仍算重名', runeDup.includes('RUNE_DUPLICATE_NAME'), runeDup);

  let runeNoName = '';
  try { runesRepository.save({ id: 'r-custom-3', name: '   ' }); } catch (e) { runeNoName = String((e as Error).message); }
  assert('符文：空名拒绝', runeNoName.includes('RUNE_NAME_REQUIRED'), runeNoName);

  const runeDefaultTpl = runesRepository.save({ id: 'r-custom-4', name: '默认模板' });
  assert('符文：新建无模板给最小模板', runeDefaultTpl.template.includes('<template>'), runeDefaultTpl.template);

  // 批量 + 集合内重名
  const batch1 = runesRepository.saveMany(
    [
      { id: 'r-b1', name: '批1' },
      { id: 'r-b2', name: '批1' },
    ],
    { skipDuplicates: true },
  );
  assert('符文：集合内重名 skipDuplicates 跳过', batch1.saved === 1 && batch1.skipped === 1, JSON.stringify(batch1));
  let batchThrow = '';
  try {
    runesRepository.saveMany([
      { id: 'r-b3', name: '批2' },
      { id: 'r-b4', name: '批2' },
    ], { skipDuplicates: false });
  } catch (e) { batchThrow = String((e as Error).message); }
  assert('符文：排序场景重名抛错且不落半批', batchThrow.includes('RUNE_DUPLICATE_NAME') && !runesRepository.list().some((r) => r.id === 'r-b3'), batchThrow);

  assert('符文：删除生效', runesRepository.remove('r-custom-1') === true && runesRepository.list().every((r) => r.id !== 'r-custom-1'));

  // 回响
  const echoA = echoesRepository.save({ id: 'e-custom-1', name: '我的回响', annoSource: 'export default {}' });
  assert('回响：保存返回完整卡片', echoA.id === 'e-custom-1' && echoA.category === 'marker', JSON.stringify(echoA));
  assert('回响：默认色与渲染类型', echoA.color === '#26A69A' && echoA.renderType === 'anno');
  let echoDup = '';
  try { echoesRepository.save({ id: 'e-custom-2', name: '我的回响' }); } catch (e) { echoDup = String((e as Error).message); }
  assert('回响：重名拒绝', echoDup.includes('ECHO_DUPLICATE_NAME'), echoDup);
  const echoDefault = echoesRepository.save({ id: 'e-custom-3', name: '默认回响' });
  assert('回响：新建无源码给最小实现', echoDefault.annoSource.includes('export default'), echoDefault.annoSource);
  assert('回响：删除生效', echoesRepository.remove('e-custom-1') === true);

  // @ 面板数据源不受影响：内置卡片仍在
  assert('面板：内置卡片仍在列表', runesRepository.list().length > 0 && echoesRepository.list().length > 0);
}

// 分类字段往返（分类 Tab 批次）
{
  const music = runesRepository.save({ id: 'r-cat-1', name: '音乐符文', category: 'music' });
  assert('符文：自定义分类入库往返', music.category === 'music', JSON.stringify(music));
  const showy = echoesRepository.save({ id: 'e-cat-1', name: '特效回响', category: 'showy' });
  assert('回响：自定义分类入库往返', showy.category === 'showy', JSON.stringify(showy));
  const upd = runesRepository.save({ id: 'r-cat-1', name: '音乐符文', category: 'novel', sortOrder: 0 });
  assert('符文：更新可改分类', upd.category === 'novel', JSON.stringify(upd));
}

// 笔记模板（note_templates 表 + 建笔记拼模板）
{
  const saved = templatesRepository.saveOne({ id: 'tpl-1', name: '会议记录', desc: '周会用', content: '## 议程\n- 议题一' });
  assert('模板：保存往返', saved.name === '会议记录' && saved.content.includes('议题一'), JSON.stringify(saved));
  assert('模板：列表含新模板', templatesRepository.listAll().some((t) => t.id === 'tpl-1'));

  const saved2 = templatesRepository.saveOne({ id: 'tpl-1', name: '会议记录 v2', content: '## 议程\n- 议题二', sortOrder: 3 });
  assert('模板：upsert 覆盖', saved2.name === '会议记录 v2' && saved2.sortOrder === 3, JSON.stringify(saved2));

  const withTpl = notesRepository.create({ title: '周会记录2', templateContent: templatesRepository.contentOf('tpl-1') ?? '' });
  assert('模板：正文按模板拼接', withTpl.content.startsWith('# 周会记录2\n\n## 议程'), withTpl.content);

  const plain = notesRepository.create({ title: '空笔记验证' });
  assert('模板：无模板默认仅 H1', plain.content === '# 空笔记验证', plain.content);

  assert('模板：删除生效', templatesRepository.remove('tpl-1') === true);
  assert('模板：删除后列表不含', !templatesRepository.listAll().some((t) => t.id === 'tpl-1'));
}

// Pack v1 批量导入：预览分组 + stale 提交
{
  const group = previewImport('echoes', [
    { name: '新回响A', anno_source: 'export default {}', render_type: 'anno' },
    { name: '冲突回响', anno_source: 'export default {}' },
    { name: '', anno_source: 'x' },
    { name: '缺正文', anno_source: '' },
    '__builtin 保护行模拟见下',
  ], 'marker');
  assert('Pack：无效条目分组（空名+缺正文+非对象）', group.invalidItems.length === 3, JSON.stringify(group.invalidItems));
  assert('Pack：新条目分组（此时尚无同名行）', group.newItems.length === 2, JSON.stringify(group.newItems));
  assert('Pack：非对象条目无效', group.invalidItems.some((it) => it.reason === 'NOT_OBJECT'));

  // 预置一个同名回响，验证冲突分组
  echoesRepository.save({ id: 'e-pack-1', name: '冲突回响', annoSource: 'export default {}' });
  const group2 = previewImport('echoes', [{ name: '冲突回响', anno_source: 'export default 2' }], 'marker');
  assert('Pack：同名进冲突组', group2.conflictItems.length === 1, JSON.stringify(group2.conflictItems));

  // 提交：新增 + 覆盖
  const commit = commitImport('echoes', {
    createNames: ['新回响A'],
    replaceNames: ['冲突回响'],
    targetCategory: 'showy',
    previewAt: group2.previewAt,
    sourceByName: {
      新回响A: { name: '新回响A', desc: '', anno_source: 'export default {}', render_type: 'anno' },
      冲突回响: { name: '冲突回响', desc: '', anno_source: 'export default 2', render_type: 'anno' },
    },
  });
  assert('Pack：提交新增+覆盖', commit.created === 1 && commit.replaced === 1, JSON.stringify(commit));
  const createdRow = echoesRepository.list().find((e) => e.name === '新回响A');
  assert('Pack：新条目落库且分类为目标分类', Boolean(createdRow) && createdRow?.category === 'showy', JSON.stringify(createdRow));
  const replacedRow = echoesRepository.list().find((e) => e.name === '冲突回响');
  assert('Pack：覆盖条目正文已更新', String(replacedRow?.annoSource ?? '').includes('2'), JSON.stringify(replacedRow));

  // stale：replace 名字已不存在 → skipped
  const stale = commitImport('echoes', {
    createNames: [], replaceNames: ['不存在的名字'], targetCategory: 'marker',
    previewAt: Date.now(), sourceByName: { 不存在的名字: { name: '不存在的名字', anno_source: 'x' } },
  });
  assert('Pack：stale 名字进 skipped', stale.skipped.length === 1 && stale.skipped[0].reason === 'NOT_FOUND', JSON.stringify(stale));

  // 内置保护：__builtin_ 前缀行不可覆盖
  echoesRepository.save({ id: '__builtin_x', name: '内置回响', annoSource: 'b' });
  const protectedGroup = previewImport('echoes', [
    { name: '内置回响', anno_source: 'b' },
    { name: 'nice', anno_source: 'b' },
  ], 'marker');
  assert('Pack：__builtin_ 前缀卡与真实内置卡都归入内置保护',
    protectedGroup.builtinBlocked.length === 2 && !echoesRepository.remove('__builtin_x'));
  const blocked = commitImport('echoes', {
    createNames: [], replaceNames: ['内置回响'], targetCategory: 'marker',
    previewAt: Date.now(), sourceByName: { 内置回响: { name: '内置回响', anno_source: 'x' } },
  });
  assert('Pack：内置行覆盖被拒', blocked.skipped.length === 1 && blocked.skipped[0].reason === 'BUILTIN_PROTECTED', JSON.stringify(blocked));

  // 符文 kind：缺 template 为无效
  const runeGroup = previewImport('runes', [{ name: '无模板符文', template: '' }], 'general');
  assert('Pack：符文缺 template 无效', runeGroup.invalidItems.length === 1 && runeGroup.invalidItems[0].reason === 'EMPTY_TEMPLATE', JSON.stringify(runeGroup));
}

// AI 模型 / 技能仓储
{
  const m = aiModelsRepository.save({ name: 'gpt 测试', providerType: 'openai-compatible', baseUrl: 'https://api.test/v1', model: 'gpt-4o-mini', apiKeyEncrypted: 'enc-1', apiKeyEncryptedVersion: 2, isDefault: true });
  assert('AI：模型保存往返', Boolean(m.id) && m.isDefault && m.apiKeyEncrypted === 'enc-1', JSON.stringify(m));
  const m2 = aiModelsRepository.save({ name: '备用', providerType: 'portkey', baseUrl: 'https://gw.test', model: 'x' });
  assert('AI：保存非默认不清已有默认', aiModelsRepository.list().find((r) => r.name === '备用')?.isDefault === false
    && aiModelsRepository.list().find((r) => r.name === 'gpt 测试')?.isDefault === true, JSON.stringify(aiModelsRepository.list()));
  aiModelsRepository.setDefault(m.id);
  assert('AI：setDefault 生效', aiModelsRepository.get(m.id)?.isDefault === true);

  const upd = aiModelsRepository.save({ id: m.id, name: 'gpt 测试 v2', providerType: 'openai-compatible', baseUrl: 'https://api.test/v1', model: 'gpt-4o-mini' });
  assert('AI：更新不改密文', upd.apiKeyEncrypted === 'enc-1' && upd.name === 'gpt 测试 v2', JSON.stringify(upd));

  const sk = aiSkillsRepository.save({ name: '摘要', title: '总结', content: '请总结' });
  assert('AI：技能保存往返', sk.builtin === false && sk.title === '总结', JSON.stringify(sk));
  const sk2 = aiSkillsRepository.save({ name: '翻译', title: '翻译', content: 'translate' });
  assert('AI：技能列表按 sort/id', aiSkillsRepository.list().map((x) => x.name).join(',') === '摘要,翻译');

  const disabledSkill = aiSkillsRepository.save({ name: '禁用技能', title: '禁用', content: 'x', enabled: false });
  assert('AI：新建技能尊重 enabled=false', disabledSkill.enabled === false, JSON.stringify(disabledSkill));
  const enabledSkill = aiSkillsRepository.save({ id: disabledSkill.id, name: '禁用技能', title: '禁用', content: 'x', enabled: true });
  assert('AI：编辑技能可重新启用', enabledSkill.enabled === true, JSON.stringify(enabledSkill));

  let dupCode = '';
  try {
    aiSkillsRepository.save({ name: ' 摘要 ', title: '重复', content: 'x' });
  } catch (error) {
    dupCode = String((error as Error).message);
  }
  assert('AI：技能名校验忽略大小写与首尾空格', dupCode === 'AI_SKILL_DUPLICATE_NAME', dupCode);

  let requiredCode = '';
  try {
    aiSkillsRepository.save({ name: '缺标题', title: '  ', content: 'x' });
  } catch (error) {
    requiredCode = String((error as Error).message);
  }
  assert('AI：技能必填校验', requiredCode === 'AI_SKILL_REQUIRED_FIELDS', requiredCode);

  // 内置技能保护：直接插 builtin=1 行，验证不可删/列表不含
  const raw = getDatabase();
  raw.prepare(`INSERT INTO ai_skills (name, title, content, builtin, enabled, sort_order, created_at, updated_at) VALUES ('内置', '', '', 1, 1, 0, ?, ?)`).run(Date.now(), Date.now());
  assert('AI：列表排除内置', !aiSkillsRepository.list().some((x) => x.builtin));
  const builtinRow = raw.prepare('SELECT id FROM ai_skills WHERE name = ?').get('内置') as { id: number };
  assert('AI：内置技能不可删', aiSkillsRepository.remove(builtinRow.id) === false);
  assert('AI：自定义技能可删', aiSkillsRepository.remove(sk.id) === true);
  assert('AI：模型可删', aiModelsRepository.remove(m2.id) === true);
}

// 标签改名 / 批量删除 / 清理未使用
{
  const tagA = tagsRepository.create('改名前');
  const tagB = tagsRepository.create('保留');
  const tagC = tagsRepository.create('待清理A');
  const noteIds: number[] = [];
  for (let i = 0; i < 2; i += 1) {
    const note = notesRepository.create({ title: `tag case ${i}`, content: '# t\n', category: '默认', tags: '改名前,保留' });
    noteIds.push(note.id);
  }
  tagsRepository.syncFromNotes();
  const countsBefore = tagsRepository.list().find((t) => t.name === '改名前')?.noteCount ?? 0;
  assert('标签：改名前进 note_tags 有计数', countsBefore === 2, String(countsBefore));

  const renamed = tagsRepository.rename(tagA.id, '改名后');
  assert('标签：改名成功', renamed.success === true && renamed.name === '改名后', JSON.stringify(renamed));
  const afterRows = notesRepository.list({ limit: 1000 }).items.filter((n) => noteIds.includes(n.id));
  assert('标签：改名同步改写 notes.tags 字符串', afterRows.every((n) => n.tags === '改名后,保留'), JSON.stringify(afterRows.map((n) => n.tags)));
  assert('标签：改名后计数跟随', (tagsRepository.list().find((t) => t.name === '改名后')?.noteCount ?? 0) === 2);
  assert('标签：旧名不再存在', !tagsRepository.list().some((t) => t.name === '改名前'));

  const dupRename = tagsRepository.rename(tagB.id, '改名后');
  assert('标签：撞名被拒', dupRename.success === false && dupRename.code === 'TAG_DUPLICATE_NAME', JSON.stringify(dupRename));

  // 待清理C 无引用 → 清理未使用应删掉它，保留有引用的
  const cleaned = tagsRepository.cleanupUnused();
  assert('标签：清理未使用命中未引用标签', cleaned >= 1, String(cleaned));
  assert('标签：有引用的标签不被清理', tagsRepository.list().some((t) => t.name === '改名后'));

  const removedMany = tagsRepository.removeMany([tagB.id, tagC.id]);
  assert('标签：批量删除返回条数', removedMany >= 1, String(removedMany));
  assert('标签：批量删除后 notes.tags 摘干净', notesRepository.list({ limit: 1000 }).items
    .filter((n) => noteIds.includes(n.id))
    .every((n) => n.tags === '改名后'), JSON.stringify(notesRepository.list({ limit: 1000 }).items.filter((n) => noteIds.includes(n.id)).map((n) => n.tags)));
}

{
  const snapshot = notesRepository.create({ title: '并发备份', content: '发送中的正文', kbGuid: 'kb-push-test' });
  notesRepository.bindRemoteGuid(snapshot, 'new-remote-guid', 'kb-push-test');
  assert('备份：远端已创建、正文未保存时仍待同步', notesRepository.get(snapshot.id)?.dirty === 1);

  const edited = notesRepository.update(snapshot.id, { content: '备份期间保存的新正文' })!;
  notesRepository.acknowledgePush(snapshot, 'new-remote-guid', 'kb-push-test');
  const afterFirstPush = notesRepository.get(snapshot.id);
  const pendingForNote = () => syncLogRepository.listPending().some((entry) => entry.noteId === snapshot.id);
  assert('备份：旧版本保存成功后仍保留新正文、远端 GUID 和待同步记录',
    afterFirstPush?.content === edited.content && afterFirstPush.docGuid === 'new-remote-guid'
      && afterFirstPush.dirty === 1 && pendingForNote());

  notesRepository.acknowledgePush(edited, 'new-remote-guid', 'kb-push-test');
  assert('备份：新版保存成功后清除待同步记录', notesRepository.get(snapshot.id)?.dirty === 0 && !pendingForNote());
}

console.log(failed === 0 ? '\n仓储层测试全部通过' : `\n仓储层测试失败 ${failed} 项`);
if (failed > 0) {
  process.exitCode = 1;
}
