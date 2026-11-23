import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateBaseInput } from '../../electron/service/blog/blogEnv';
import { hashExportContent, writeBlogPosts } from '../../electron/service/blog/deploy';

async function tempBlog(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'coolma-blog-'));
}

async function readManifest(blogDir: string): Promise<{ files: Record<string, { hash: string; size: number }> }> {
  const raw = await fs.readFile(path.join(blogDir, '.vuepress', 'export-manifest.json'), 'utf-8');
  return JSON.parse(raw);
}

test('导出：首次写出全部笔记并生成 manifest', async () => {
  const blogDir = await tempBlog();
  const notes = [
    { title: 'Alpha', content: 'alpha body' },
    { title: 'Beta', content: 'beta body' },
  ];
  const result = await writeBlogPosts(blogDir, notes, 'default', '工作');
  assert.equal(result.writtenFiles, 2);
  assert.equal(result.skippedFiles, 0);
  assert.equal(result.entries.length, 2);
  const manifest = await readManifest(blogDir);
  const ids = Object.keys(manifest.files);
  assert.equal(ids.length, 2);
  for (const id of ids) {
    const data = manifest.files[id];
    assert.equal(data.hash, hashExportContent(await fs.readFile(path.join(blogDir, '_posts', `${id}.md`), 'utf-8')));
  }
  const body = await fs.readFile(path.join(blogDir, '_posts', `${result.entries[0].id}.md`), 'utf-8');
  assert.match(body, /alpha body/);
  assert.match(body, /^---\n/);
});

test('导出：内容没变时整篇跳过，manifest 保留', async () => {
  const blogDir = await tempBlog();
  const notes = [{ title: 'Stable', content: 'same body' }];
  const first = await writeBlogPosts(blogDir, notes, 'default', '');
  const before = await fs.stat(path.join(blogDir, '_posts', `${first.entries[0].id}.md`));
  const second = await writeBlogPosts(blogDir, notes, 'default', '');
  const after = await fs.stat(path.join(blogDir, '_posts', `${first.entries[0].id}.md`));
  assert.equal(second.writtenFiles, 0);
  assert.equal(second.skippedFiles, 1);
  assert.equal(before.mtimeMs, after.mtimeMs, '未变化时不应重写文件');
});

test('导出：只有改动的一篇被重写', async () => {
  const blogDir = await tempBlog();
  const notes = [
    { title: 'One', content: 'v1' },
    { title: 'Two', content: 'keep' },
  ];
  const first = await writeBlogPosts(blogDir, notes, 'default', '');
  const next = [
    { title: 'One', content: 'v2' },
    { title: 'Two', content: 'keep' },
  ];
  const second = await writeBlogPosts(blogDir, next, 'default', '');
  assert.equal(second.writtenFiles, 1);
  assert.equal(second.skippedFiles, 1);
  const changed = await fs.readFile(path.join(blogDir, '_posts', `${first.entries[0].id}.md`), 'utf-8');
  assert.match(changed, /v2/);
});

test('导出：文件被删但 manifest 没变时会补写', async () => {
  const blogDir = await tempBlog();
  const notes = [{ title: 'Lost', content: 'body' }];
  const first = await writeBlogPosts(blogDir, notes, 'default', '');
  const file = path.join(blogDir, '_posts', `${first.entries[0].id}.md`);
  await fs.rm(file);
  const second = await writeBlogPosts(blogDir, notes, 'default', '');
  assert.equal(second.writtenFiles, 1);
  assert.equal(second.skippedFiles, 0);
  assert.match(await fs.readFile(file, 'utf-8'), /body/);
});

test('导出：incremental=false 时强制重写全部', async () => {
  const blogDir = await tempBlog();
  const notes = [{ title: 'Force', content: 'x' }];
  await writeBlogPosts(blogDir, notes);
  const forced = await writeBlogPosts(blogDir, notes, 'default', '', { incremental: false });
  assert.equal(forced.writtenFiles, 1);
  assert.equal(forced.skippedFiles, 0);
});

test('base 校验：合法路径被规范化', () => {
  assert.deepEqual(validateBaseInput('/blog'), { ok: true, value: '/blog/' });
  assert.deepEqual(validateBaseInput('/foo///'), { ok: true, value: '/foo/' });
  assert.deepEqual(validateBaseInput('./'), { ok: true, value: './' });
  assert.deepEqual(validateBaseInput('"/blog"'), { ok: true, value: '/blog/' });
  assert.deepEqual(validateBaseInput(''), { ok: true, value: '' });
  assert.deepEqual(validateBaseInput('   '), { ok: true, value: '' });
});

test('base 校验：非法字符与相对裸路径被拦', () => {
  for (const bad of ['/a#b', '/a?x=1', '/a b', 'blog', 'https://example.com', '/a\\b']) {
    const result = validateBaseInput(bad);
    assert.equal(result.ok, false, `${bad} 应被拒绝`);
    assert.ok(result.error, `${bad} 应带错误原因`);
  }
});

test('导出：千篇级并发生成，内容与条目一一对应', async () => {
  const blogDir = await tempBlog();
  const notes = Array.from({ length: 120 }, (_, i) => ({ title: `Note ${i}`, content: `body ${i}` }));
  const result = await writeBlogPosts(blogDir, notes, 'default', '批量');
  assert.equal(result.writtenFiles, 120);
  assert.equal(result.entries.length, 120);
  for (const entry of result.entries) {
    const text = await fs.readFile(path.join(blogDir, '_posts', `${entry.id}.md`), 'utf-8');
    assert.match(text, new RegExp(`body ${entry.title.split(' ')[1]}`));
  }
});
