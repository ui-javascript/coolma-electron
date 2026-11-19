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
import { syncLogRepository } from '../electron/service/db/sync-log-repository';
import { runIntegrityCheck } from '../electron/service/db/diagnostics';

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
assert('迁移：version 走到 3', schemaVersion === 3, String(schemaVersion));
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

// ===== 笔记创建与唯一标题 =====
const first = notesRepository.create({ title: '测试笔记', content: 'hello', category: '/工作' });
assert('笔记：创建返回自增 id', first.id > 0, String(first.id));
assert('笔记：默认 dirty=1', first.dirty === 1, String(first.dirty));
const second = notesRepository.create({ title: '测试笔记', content: 'dup', category: '/工作' });
assert('笔记：同名自动去重', second.title === '测试笔记 (2)', second.title);
const elsewhere = notesRepository.create({ title: '测试笔记', content: 'other', category: '/生活' });
assert('笔记：跨分类不撞名', elsewhere.title === '测试笔记', elsewhere.title);

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

// ===== 分类 =====
const category = categoriesRepository.create({ category: '/工作/子目录' });
assert('分类：创建返回节点', Boolean(category?.category), JSON.stringify(category));
assert('分类：countNotes 统计', categoriesRepository.countNotes('/工作') >= 1, String(categoriesRepository.countNotes('/工作')));
assert('分类：根目录不可删', categoriesRepository.remove('/') === false);
assert('分类：parentOf 解析', categoriesRepository.parentOf('/工作/子目录') === '/工作', categoriesRepository.parentOf('/工作/子目录'));

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

console.log(failed === 0 ? '\n仓储层测试全部通过' : `\n仓储层测试失败 ${failed} 项`);
if (failed > 0) {
  process.exitCode = 1;
}
