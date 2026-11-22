/**
 * 同步冲突判定的纯规则（不碰数据库、不碰网络，单测直接覆盖）。
 *
 * 口径（2026-11-22 与产品确认）：
 * - **没有 base 快照**，只记“上次成功同步时的内容 hash + 远端修改时间”。
 * - 单边变更：自动处理，不打扰用户 —— 只有远端改 → 直接拉；只有本地改 → 直接推。
 * - 双边都改 → 判冲突，**默认拒绝覆盖**，进冲突队列由用户二选一（保留本地 / 用云端）
 *   或显式跳过。
 * - 时间/基线未知时不做“远端已变”的臆断，避免升级后把所有老笔记误判成冲突。
 */

import { createHash } from 'node:crypto';

export interface SyncPayload {
  title: string;
  content: string;
  category: string;
  tags: string;
}

export type SyncDecision = 'noop' | 'pull' | 'push' | 'conflict';

export interface SyncDecisionInput {
  /** 本地当前内容（会参与 hash） */
  local: SyncPayload;
  /** 上次成功同步时的内容 hash；null 表示从未成功同步过 */
  syncedHash: string | null;
  /** 远端当前的修改时间（为知 dataModified） */
  remoteModified: number | null;
  /** 上次成功同步时记下的远端修改时间 */
  syncedRemoteModified: number | null;
  /** 本地是否有未同步改动（outbox 里的 dirty 标记） */
  dirty: boolean;
  /** 远端对象是否存在；本地新建、从未上传时为 false */
  remoteKnown: boolean;
}

/** 参与同步判重的内容指纹：标题/正文/分类/标签任一变化都算本地改动。 */
export function hashSyncPayload(payload: SyncPayload): string {
  const normalized = [
    String(payload.title ?? '').trim(),
    String(payload.content ?? ''),
    String(payload.category ?? '').trim(),
    String(payload.tags ?? '').trim(),
  ].join('\u0000');
  return createHash('sha1').update(normalized).digest('hex');
}

export function decideSyncAction(input: SyncDecisionInput): SyncDecision {
  const localHash = hashSyncPayload(input.local);
  const localChanged = input.syncedHash === null
    ? Boolean(input.dirty)
    : input.syncedHash !== localHash;

  if (!input.remoteKnown) {
    return localChanged || input.dirty ? 'push' : 'noop';
  }

  const remoteChanged = input.remoteModified !== null
    && input.syncedRemoteModified !== null
    && Number(input.remoteModified) > Number(input.syncedRemoteModified);

  if (!localChanged && !remoteChanged) {
    return 'noop';
  }
  if (remoteChanged && !localChanged) {
    return 'pull';
  }
  if (!remoteChanged) {
    return 'push';
  }
  return 'conflict';
}
