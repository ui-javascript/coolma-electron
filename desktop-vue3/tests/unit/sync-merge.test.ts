import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSyncAction, hashSyncPayload } from '../../electron/service/sync/sync-merge';

const base = { title: 'A', content: 'hello', category: '/x', tags: 't1,t2' };

test('hash：标题首尾空白归一，正文/分类/标签任一变化都会改指纹', () => {
  const h = hashSyncPayload(base);
  assert.equal(hashSyncPayload({ ...base, title: '  A  ' }), h);
  assert.notEqual(hashSyncPayload({ ...base, content: 'hello!' }), h);
  assert.notEqual(hashSyncPayload({ ...base, category: '/y' }), h);
  assert.notEqual(hashSyncPayload({ ...base, tags: 't1' }), h);
});

test('新建笔记（远端不存在）直接推', () => {
  assert.equal(decideSyncAction({
    local: base,
    syncedHash: null,
    remoteModified: null,
    syncedRemoteModified: null,
    dirty: true,
    remoteKnown: false,
  }), 'push');
});

test('两边都没动：noop，不产生请求', () => {
  const hash = hashSyncPayload(base);
  assert.equal(decideSyncAction({
    local: base,
    syncedHash: hash,
    remoteModified: 1000,
    syncedRemoteModified: 1000,
    dirty: false,
    remoteKnown: true,
  }), 'noop');
});

test('只有远端改：自动拉取，不打扰用户', () => {
  const hash = hashSyncPayload(base);
  assert.equal(decideSyncAction({
    local: base,
    syncedHash: hash,
    remoteModified: 2000,
    syncedRemoteModified: 1000,
    dirty: false,
    remoteKnown: true,
  }), 'pull');
});

test('只有本地改：自动推送', () => {
  assert.equal(decideSyncAction({
    local: { ...base, content: 'local edit' },
    syncedHash: hashSyncPayload(base),
    remoteModified: 1000,
    syncedRemoteModified: 1000,
    dirty: true,
    remoteKnown: true,
  }), 'push');
});

test('两边都改：判冲突，默认拒绝覆盖', () => {
  assert.equal(decideSyncAction({
    local: { ...base, content: 'local edit' },
    syncedHash: hashSyncPayload(base),
    remoteModified: 2000,
    syncedRemoteModified: 1000,
    dirty: true,
    remoteKnown: true,
  }), 'conflict');
});

test('远端时间未知：不臆断成冲突，本地有改动仍按推送处理', () => {
  assert.equal(decideSyncAction({
    local: { ...base, content: 'local edit' },
    syncedHash: hashSyncPayload(base),
    remoteModified: null,
    syncedRemoteModified: 1000,
    dirty: true,
    remoteKnown: true,
  }), 'push');
});

test('同一时间戳不算远端改动；本地改动则推送', () => {
  assert.equal(decideSyncAction({
    local: { ...base, content: 'local edit' },
    syncedHash: hashSyncPayload(base),
    remoteModified: 1000,
    syncedRemoteModified: 1000,
    dirty: true,
    remoteKnown: true,
  }), 'push');
});