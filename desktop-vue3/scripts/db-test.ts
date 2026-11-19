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

console.log(failed === 0 ? '\n仓储层测试全部通过' : `\n仓储层测试失败 ${failed} 项`);
if (failed > 0) {
  process.exitCode = 1;
}
