import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcResult } from '@shared/ipc/contract';
import { invoke } from '@/services/ipc';

/**
 * 云函数调用（复刻 vue2 services/cloud/VkFilesService + CloudFunctionProvider）。
 * 真正的 HTTP 请求在主进程（controller/cloudfn），这里只做协议归一化。
 */
export interface NavCard {
  id: string;
  title: string;
  desc: string;
  imageUrl: string;
  targetUrl: string;
  categoryNo: string;
  createdAt: string;
}

export const invokeCloudFn = <T = unknown>(url: string, data: Record<string, unknown> = {}): Promise<IpcResult<T>> =>
  invoke<T>(IPC_CHANNELS.cloudfn.invoke, { url, data });

const pickFirst = (raw: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }
  }
  return '';
};

/** vue2 `normalizeItem`：后端字段命名不稳，逐个兜底。 */
function normalizeItem(raw: unknown): NavCard | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = pickFirst(record, ['id', '_id', 'fileID', 'file_id', 'docId'])
    || `${pickFirst(record, ['title', 'name']) || 'nav'}-${Math.random().toString(36).slice(2, 8)}`;
  const card: NavCard = {
    id,
    title: pickFirst(record, ['title', 'name', 'label']),
    desc: pickFirst(record, ['desc', 'summary', 'description', 'brief']),
    imageUrl: pickFirst(record, ['imageUrl', 'img', 'image', 'icon', 'cover', 'thumbnail']),
    targetUrl: pickFirst(record, ['targetUrl', 'url', 'link', 'href']),
    categoryNo: pickFirst(record, ['categoryNo', 'category']),
    createdAt: pickFirst(record, ['createdAt', 'created_at', 'createTime']),
  };
  return card.imageUrl || card.targetUrl || card.title ? card : null;
}

function extractList(result: unknown): unknown[] {
  if (!result) {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }
  if (typeof result === 'object') {
    for (const key of ['data', 'rows', 'list', 'records']) {
      const value = (result as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
}

/** 拉导航卡片：`admin/vkfiles/pub/listFiles`（与 vue2 完全同路径）。 */
export async function listNavFiles(options: { categoryNo?: string; title?: string } = {}): Promise<NavCard[]> {
  const result = await invokeCloudFn('admin/vkfiles/pub/listFiles', {
    categoryNo: options.categoryNo || '',
    title: options.title || '',
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.error.message), { code: result.error.code });
  }
  return extractList(result.data).map(normalizeItem).filter((item): item is NavCard => item !== null);
}

export const __testing = { normalizeItem, extractList };

export const openExternal = (url: string): Promise<IpcResult<true>> => invoke<true>(IPC_CHANNELS.app.openExternal, { url });
