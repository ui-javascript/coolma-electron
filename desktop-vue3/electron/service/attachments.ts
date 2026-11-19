import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 本地附件（图片）存储：目录结构与 vue2 的 MemocastTempDir 保持一致，
 * 这样旧数据/旧链接不用迁移。
 *
 *   <root>/MemocastTempDir/<kbGuid>/<docGuid>/<md5>.<ext>
 *
 * 本地新建的笔记没有 kbGuid/docGuid（本地 docGuid 形如 local_xxx），
 * 用固定占位目录，避免同一篇笔记的图片散落到随机目录。
 */
export const ATTACHMENT_ROOT_NAME = 'MemocastTempDir';

export function resolveKbSegment(kbGuid: string | null | undefined): string {
  return String(kbGuid ?? '').trim() || 'local';
}

export function resolveDocSegment(docGuid: string | null | undefined, noteId?: number | null): string {
  const raw = String(docGuid ?? '').trim();
  if (raw) {
    return raw.replace(/[^\w.-]/g, '_');
  }
  return noteId ? `note-${noteId}` : 'untitled';
}

export function attachmentDir(root: string, kbGuid: string | null | undefined, docGuid: string | null | undefined, noteId?: number | null): string {
  return path.join(root, ATTACHMENT_ROOT_NAME, resolveKbSegment(kbGuid), resolveDocSegment(docGuid, noteId));
}

/** 内容哈希做文件名：同一张图重复粘贴不会产生多份文件（对齐 vue2 的 md5 命名）。 */
export function hashImageName(buffer: Buffer, ext = '.png'): string {
  const hash = createHash('md5').update(buffer).digest('hex');
  return `${hash}${ext.startsWith('.') ? ext : `.${ext}`}`;
}

/** 自定义协议地址：coolma://coolma.app/<kb>/<doc>/<name>（与 vue2 的 resource-loader 一致）。 */
export function coolmaUrl(kbGuid: string | null | undefined, docGuid: string | null | undefined, name: string, noteId?: number | null): string {
  return `coolma://coolma.app/${resolveKbSegment(kbGuid)}/${resolveDocSegment(docGuid, noteId)}/${name}`;
}

export interface SaveAttachmentInput {
  root: string;
  kbGuid?: string | null;
  docGuid?: string | null;
  noteId?: number | null;
  base64: string;
  ext?: string;
}

export interface SaveAttachmentResult {
  filePath: string;
  name: string;
  url: string;
}

export async function saveImageAttachment(input: SaveAttachmentInput): Promise<SaveAttachmentResult> {
  const raw = String(input.base64 ?? '');
  const payload = raw.includes(',') && raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    throw new Error('ATTACHMENT_EMPTY');
  }
  const name = hashImageName(buffer, input.ext || '.png');
  const dir = attachmentDir(input.root, input.kbGuid, input.docGuid, input.noteId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await writeFile(filePath, buffer);
  return {
    filePath,
    name,
    url: coolmaUrl(input.kbGuid, input.docGuid, name, input.noteId),
  };
}

/**
 * 协议侧的路径解析：只允许 <kb>/<doc>/<name> 三段，拒绝 .. 穿越。
 */
export function parseCoolmaUrl(rawUrl: string): { kbGuid: string; docGuid: string; name: string } | null {
  const stripped = String(rawUrl ?? '').replace(/^coolma:\/\/coolma\.app\//, '').replace(/^coolma:\/\//, '');
  const parts = stripped.split('/').filter(Boolean);
  if (parts.length !== 3) {
    return null;
  }
  const [kbGuid, docGuid, name] = parts;
  if (parts.some((part) => part.includes('..') || part.includes('\\'))) {
    return null;
  }
  return { kbGuid, docGuid, name };
}
