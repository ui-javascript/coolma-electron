import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import * as wizMarkdown from '@altairwei/wiz-markdown';
import { settingsRepository } from '../db/settings-repository';
import { notesRepository } from '../db/notes-repository';
import { ATTACHMENT_ROOT_NAME, parseCoolmaUrl } from '../attachments';
import { isLiteCategory, replaceCoolmaWithIndexFiles, replaceIndexFilesWithCoolma } from './wiznote-resources';

/**
 * 为知笔记（WizNote）同步客户端。
 *
 * 协议全部照 vue2 `src/utils/api.js`，没有自造接口：
 *   - 登录  POST {as}/as/user/login            body { userId, password }
 *   - 分类  GET  {ks}/ks/category/all/{kbGuid}
 *   - 列表  GET  {ks}/ks/note/list/category/{kbGuid}?category&start&count&withAbstract
 *   - 下载  GET  {ks}/ks/note/download/{kbGuid}/{docGuid}?downloadInfo=1&downloadData=1
 *   - 保存  PUT  {ks}/ks/note/save/{kbGuid}/{docGuid}
 *   - 新建  POST {ks}/ks/note/create/{kbGuid}
 * 鉴权头 `X-Wiz-Token`；响应先判 `returnCode/code === 200`，再剥 `result`。
 *
 * 附件资源按 vue2 的 `index_files/<name>` ↔ `coolma://coolma.app/<kb>/<doc>/<name>` 做双向映射；
 * 拉取时把服务端资源落到本地 temp 目录（protocol 处理器可直接读），推送时把本地资源 multipart 上传。
 */
export interface WizConfig {
  baseUrl: string;
  token: string;
  kbGuid: string;
  kbServer: string;
  email: string;
  displayName: string;
  userGuid: string;
  password?: string;
  lastSyncAt?: number;
}

const CONFIG_KEY = 'setting/sync/wiznote';
const DEFAULT_BASE = 'https://as.wiz.cn';

function readConfig(): WizConfig {
  const raw = settingsRepository.get(CONFIG_KEY);
  return {
    baseUrl: DEFAULT_BASE,
    token: '',
    kbGuid: '',
    kbServer: '',
    email: '',
    displayName: '',
    userGuid: '',
    ...(raw && typeof raw === 'object' ? (raw as Partial<WizConfig>) : {}),
  };
}

function saveConfig(patch: Partial<WizConfig>): WizConfig {
  const next = { ...readConfig(), ...patch };
  settingsRepository.set(CONFIG_KEY, next);
  return next;
}

function trimBase(url: string): string {
  return (url || DEFAULT_BASE).replace(/\/+$/, '');
}

export function getPublicConfig(): Omit<WizConfig, 'password' | 'token'> & { loggedIn: boolean } {
  const config = readConfig();
  return {
    baseUrl: config.baseUrl,
    kbGuid: config.kbGuid,
    kbServer: config.kbServer,
    email: config.email,
    displayName: config.displayName,
    userGuid: config.userGuid,
    lastSyncAt: config.lastSyncAt,
    loggedIn: Boolean(config.token && config.kbGuid),
  };
}

async function request<T>(
  method: string,
  url: string,
  body: unknown,
  config: WizConfig,
  timeout = 30000,
  unwrap = true,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(config.token ? { 'X-Wiz-Token': config.token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error(`WizNote responded ${response.status}`), { code: 'TOKEN_REQUIRED' });
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const code = Number(payload.returnCode ?? payload.code ?? 200);
    if (code !== 200) {
      throw Object.assign(
        new Error(String(payload.returnMessage ?? payload.message ?? `WizNote code ${code}`)),
        { code },
      );
    }
    return (unwrap && 'result' in payload ? payload.result : payload) as T;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw Object.assign(new Error('WizNote request timed out'), { code: 'TIMEOUT' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function login(input: {
  userId: string;
  password: string;
  baseUrl?: string;
  rememberPassword?: boolean;
}): Promise<ReturnType<typeof getPublicConfig>> {
  const baseUrl = trimBase(input.baseUrl || DEFAULT_BASE);
  const result = await request<Record<string, unknown>>(
    'POST',
    `${baseUrl}/as/user/login`,
    { userId: input.userId, password: input.password },
    { ...readConfig(), baseUrl, token: '' },
    40000,
  );
  saveConfig({
    baseUrl,
    token: String(result.token ?? ''),
    kbGuid: String(result.kbGuid ?? ''),
    kbServer: trimBase(String(result.kbServer ?? '')),
    email: String(result.email ?? input.userId),
    displayName: String(result.displayName ?? ''),
    userGuid: String(result.userGuid ?? ''),
    password: input.rememberPassword ? input.password : undefined,
  });
  return getPublicConfig();
}

export function logout(): ReturnType<typeof getPublicConfig> {
  const config = readConfig();
  if (config.token) {
    void request('GET', `${config.baseUrl}/as/user/logout`, undefined, config, 10000).catch(() => undefined);
  }
  saveConfig({ token: '', kbGuid: '', kbServer: '' });
  return getPublicConfig();
}

export interface WizCategory {
  category: string;
  parent: string;
}

export const CATEGORY_POS_KEY = 'setting/sync/categoryPos';

function normalizeCategoryPosition(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const pos = Number(value);
    if (key && Number.isFinite(pos)) {
      result[key] = pos;
    }
  }
  return result;
}

/**
 * 分类列表 + 服务端顺序 pos（vue2 `fetchRemoteCategories` 的 `res?.pos`）。
 * `pos` 是 `/My Notes/` 这种 key → 序号；侧栏树按它排序，不是前端瞎排。
 */
export async function fetchCategoryDirectory(): Promise<{ items: WizCategory[]; pos: Record<string, number> }> {
  const config = readConfig();
  if (!config.kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  const payload = await request<Record<string, unknown>>(
    'GET',
    `${config.kbServer}/ks/category/all/${config.kbGuid}`,
    undefined,
    config,
    30000,
    false,
  );
  const raw = payload.result ?? payload;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { categories?: unknown })?.categories)
      ? ((raw as { categories: unknown[] }).categories)
      : [];
  const items = list
    .map((item) => {
      const category = typeof item === 'string'
        ? item
        : String((item as Record<string, unknown>)?.category ?? (item as Record<string, unknown>)?.name ?? '');
      if (!category) {
        return null;
      }
      const trimmed = category.replace(/\/$/, '');
      const parent = trimmed.lastIndexOf('/') > 0 ? `${trimmed.slice(0, trimmed.lastIndexOf('/') + 1)}` : '/';
      return { category, parent: parent || '/' };
    })
    .filter((item): item is WizCategory => item !== null);
  return {
    items,
    pos: normalizeCategoryPosition(payload.pos ?? payload.resultPos),
  };
}

export async function fetchCategories(): Promise<WizCategory[]> {
  const directory = await fetchCategoryDirectory();
  settingsRepository.set(CATEGORY_POS_KEY, directory.pos);
  return directory.items;
}

export interface WizNoteSummary {
  docGuid: string;
  title: string;
  category: string;
  dataModified: number;
  dataCreated: number;
  abstract: string;
}

export async function listNotes(category = '/', limit = 100): Promise<WizNoteSummary[]> {
  const config = readConfig();
  const query = new URLSearchParams({
    category,
    start: '0',
    count: String(limit),
    withAbstract: 'true',
    orderBy: 'dataModified',
  });
  const raw = await request<unknown>(
    'GET',
    `${config.kbServer}/ks/note/list/category/${config.kbGuid}?${query.toString()}`,
    undefined,
    config,
  );
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { result?: unknown })?.result)
      ? ((raw as { result: unknown[] }).result)
      : [];
  return list.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      docGuid: String(record.docGuid ?? record.guid ?? ''),
      title: String(record.title ?? 'Untitled'),
      category: String(record.category ?? category),
      dataModified: Number(record.dataModified ?? 0),
      dataCreated: Number(record.dataCreated ?? 0),
      abstract: String(record.abstract ?? ''),
    };
  });
}

interface DownloadedNote {
  info: { docGuid?: string; title?: string; category?: string; dataModified?: number; dataCreated?: number; tags?: string };
  html: string;
  resources?: Array<{ name: string; url?: string }>;
}

async function download(docGuid: string): Promise<DownloadedNote> {
  const config = readConfig();
  const query = new URLSearchParams({ downloadInfo: '1', downloadData: '1' });
  return request<DownloadedNote>(
    'GET',
    `${config.kbServer}/ks/note/download/${config.kbGuid}/${docGuid}?${query.toString()}`,
    undefined,
    config,
    40000,
  );
}

let turndownService: { turndown: (html: string) => string } | null = null;

async function htmlToMarkdown(html: string): Promise<string> {
  if (!turndownService) {
    const { default: TurndownService } = await import('turndown');
    turndownService = new TurndownService({ codeBlockStyle: 'fenced', headingStyle: 'atx' });
  }
  return turndownService.turndown(html || '');
}

/**
 * 把服务端资源落到本地 temp 目录（与 coolma:// 协议同一个根）。
 * 优先用下载响应里的 url，失败再按为知两条常见下载路径兜底。
 */
async function cacheResource(
  config: WizConfig,
  docGuid: string,
  resource: { name: string; url?: string },
): Promise<string> {
  const name = path.basename(resource.name);
  if (!name || name !== resource.name || name.includes('..')) {
    throw new Error(`invalid resource name: ${resource.name}`);
  }
  const dir = path.join(app.getPath('temp'), ATTACHMENT_ROOT_NAME, config.kbGuid, docGuid);
  const target = path.join(dir, name);
  const encodedName = encodeURIComponent(name);
  const candidates = [
    resource.url,
    `${config.kbServer}/ks/resource/download/${config.kbGuid}/${docGuid}/${encodedName}`,
    `${config.kbServer}/ks/resource/${config.kbGuid}/${docGuid}/${encodedName}`,
  ].filter((item): item is string => Boolean(item));

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    const url = candidate.startsWith('http') ? candidate : `${config.kbServer}${candidate.startsWith('/') ? '' : '/'}${candidate}`;
    try {
      const response = await fetch(url, { headers: { 'X-Wiz-Token': config.token } });
      if (!response.ok) {
        lastError = new Error(`resource ${name} responded ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        lastError = new Error(`resource ${name} empty`);
        continue;
      }
      await mkdir(dir, { recursive: true });
      await writeFile(target, buffer);
      return name;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error(`resource ${name} not found`);
}

/** 为知下载的 HTML → 本地 Markdown；标题以 .md 结尾的走 wizMarkdown 提取。 */
async function toMarkdown(
  note: DownloadedNote,
  config: WizConfig,
  docGuid: string,
): Promise<{ content: string; missing: number }> {
  const title = String(note.info?.title ?? '');
  let html = String(note.html ?? '');
  let missing = 0;
  const names = (note.resources ?? []).map((resource) => resource?.name).filter((name): name is string => Boolean(name));
  html = replaceIndexFilesWithCoolma(html, config.kbGuid, docGuid, names);
  for (const resource of note.resources ?? []) {
    if (!resource?.name) {
      continue;
    }
    try {
      await cacheResource(config, docGuid, resource);
    } catch {
      missing += 1;
    }
  }
  const content = title.toLowerCase().endsWith('.md')
    ? wizMarkdown.extract(html, { convertImgTag: true, normalizeWhitespace: false })
    : await htmlToMarkdown(html);
  return { content, missing };
}

/** 从 Markdown 里收集 coolma:// 资源名，并给出本地文件路径。 */
function collectResources(markdown: string): Array<{ name: string; filePath: string }> {
  const pattern = /coolma:\/\/coolma\.app\/([^/\s)]+)\/([^/\s)]+)\/([^/\s)]+)/g;
  const seen = new Set<string>();
  const result: Array<{ name: string; filePath: string }> = [];
  for (const match of markdown.matchAll(pattern)) {
    const [, kbGuid, docGuid, name] = match;
    if (seen.has(name)) {
      continue;
    }
    const parsed = parseCoolmaUrl(`coolma://coolma.app/${kbGuid}/${docGuid}/${name}`);
    if (!parsed) {
      continue;
    }
    seen.add(name);
    result.push({
      name,
      filePath: path.join(app.getPath('temp'), ATTACHMENT_ROOT_NAME, parsed.kbGuid, parsed.docGuid, parsed.name),
    });
  }
  return result;
}

/** 为知资源上传：POST /ks/resource/upload/{kb}/{doc} multipart（对齐 vue2 wiz-resource-helper）。 */
async function uploadResource(
  config: WizConfig,
  docGuid: string,
  name: string,
  buffer: Buffer,
): Promise<string> {
  const form = new FormData();
  form.append('kbGuid', config.kbGuid);
  form.append('docGuid', docGuid);
  form.append('data', new Blob([buffer]), name);
  const response = await fetch(`${config.kbServer}/ks/resource/upload/${config.kbGuid}/${docGuid}`, {
    method: 'POST',
    headers: { 'X-Wiz-Token': config.token },
    body: form,
  });
  const payload = (await response.json()) as Record<string, unknown>;
  const code = Number(payload.returnCode ?? payload.code ?? 200);
  const result = payload.result as { name?: string } | undefined;
  if (code !== 200 || !result?.name) {
    throw new Error(String(payload.externMessage ?? payload.returnMessage ?? `upload ${name} failed`));
  }
  return String(result.name);
}

/** 图床上传：把粘贴的图片直接传到为知官方图床，返回服务端资源名（本地再按同名落盘）。 */
export async function uploadImageResource(input: {
  buffer: Buffer;
  name: string;
  docGuid: string;
}): Promise<{ name: string }> {
  const config = readConfig();
  if (!config.token || !config.kbGuid) {
    throw new Error('WizNote is not logged in');
  }
  if (!config.kbServer) {
    throw new Error('WizNote kbServer is missing');
  }
  const docGuid = String(input.docGuid || '').trim();
  if (!docGuid) {
    throw new Error('WizNote docGuid is missing');
  }
  const name = await uploadResource(config, docGuid, input.name, input.buffer);
  return { name };
}

/** 推送前把本地 coolma:// 链接换回 index_files/<name>（vue2 embedMDNote 的逆操作）。 */
function toWizHtml(
  markdown: string,
  isLite: boolean,
  config: WizConfig,
  sourceDocGuid: string,
  embedDocGuid: string,
): { html: string; names: string[] } {
  const resources = collectResources(markdown);
  const names = resources.map((item) => item.name);
  // 本地新笔记的图片链接里是 local_ 占位，替换时必须用真实的 note.docGuid；
  // 真正 embed 时新笔记还没有远端 guid，用空串（与 vue2 createDoc 一致）。
  const text = replaceCoolmaWithIndexFiles(markdown, config.kbGuid, sourceDocGuid, names);
  return {
    html: wizMarkdown.embed(text, { wrapWithPreTag: isLite, kbGuid: config.kbGuid, docGuid: embedDocGuid }),
    names,
  };
}

export interface PullResult {
  imported: number;
  failed: number;
  errors: string[];
}

/** 拉取一个分类（默认根）下的笔记，落进本地 SQLite（dirty=0）。 */
export async function pull(input: { category?: string; limit?: number } = {}): Promise<PullResult> {
  const config = readConfig();
  if (!config.token || !config.kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  const list = await listNotes(input.category || '/', input.limit || 100);
  // 分类顺序是服务端 pos，拉笔记时顺手刷一次；失败不影响笔记导入。
  try {
    await fetchCategories();
  } catch {
    // 分类接口失败不阻断 pull
  }
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const summary of list) {
    try {
      const note = await download(summary.docGuid);
      const { content, missing } = await toMarkdown(note, config, summary.docGuid);
      if (missing > 0) {
        errors.push(`${summary.title}: ${missing} 个附件未能缓存`);
      }
      notesRepository.upsertRemote({
        docGuid: summary.docGuid,
        kbGuid: config.kbGuid,
        title: String(note.info?.title ?? summary.title).replace(/\.md$/i, ''),
        content,
        category: String(note.info?.category ?? summary.category),
        tags: String(note.info?.tags ?? ''),
        serverModified: Number(note.info?.dataModified ?? summary.dataModified) || null,
      });
      imported += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${summary.title}: ${(error as Error).message}`);
    }
  }
  saveConfig({ lastSyncAt: Date.now() });
  return { imported, failed, errors: errors.slice(0, 10) };
}

export interface PushResult {
  pushed: number;
  created: number;
  failed: number;
  errors: string[];
}

/** 推本地 dirty 笔记：远端 docGuid 走 save，本地 local_ 走 create 再回填 docGuid。 */
export async function push(input: { limit?: number } = {}): Promise<PushResult> {
  const config = readConfig();
  if (!config.token || !config.kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  const notes = notesRepository.listDirty(input.limit || 50);
  let pushed = 0;
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const note of notes) {
    const docGuid = note.docGuid ?? '';
    const isRemote = Boolean(docGuid) && !docGuid.startsWith('local_');
    const isLite = isLiteCategory(note.category);
    const category = note.category || '/My Notes/';
    const targetGuid = isRemote ? docGuid : '';
    const { html, names } = toWizHtml(note.content ?? '', isLite, config, docGuid, targetGuid);
    const resources = names.map((name) => ({ name }));
    const payload = {
      html,
      title: note.title,
      kbGuid: config.kbGuid,
      resources,
      type: isLite ? 'lite/markdown' : 'document',
      tags: note.tags || '',
      category,
    };

    let remoteGuid = targetGuid;
    let createdHere = false;
    try {
      if (!isRemote) {
        const result = await request<Record<string, unknown>>(
          'POST',
          `${config.kbServer}/ks/note/create/${config.kbGuid}`,
          { ...payload, docGuid: undefined, owner: config.email },
          config,
          40000,
        );
        remoteGuid = String(result?.guid ?? result?.docGuid ?? '');
        if (!remoteGuid) {
          throw new Error('createNote returned no guid');
        }
        createdHere = true;
        // 先绑定远端 guid，后续 save/附件失败时把 dirty 打回去，避免下次又建一篇重复的。
        notesRepository.rebindDocGuid(note.id, remoteGuid, config.kbGuid);
      }

      // 本地附件上传到这篇远端笔记（新笔记创建后才有 docGuid）。
      for (const item of collectResources(note.content ?? '')) {
        try {
          const buffer = await readFile(item.filePath);
          await uploadResource(config, remoteGuid, item.name, buffer);
        } catch (error) {
          errors.push(`${note.title}: 附件 ${item.name} 上传失败 ${(error as Error).message}`);
        }
      }

      // create 已带上正文；附件上传后再 save 一次，让服务端把 index_files 绑定到 docGuid。
      await request(
        'PUT',
        `${config.kbServer}/ks/note/save/${config.kbGuid}/${remoteGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
        { ...payload, docGuid: remoteGuid },
        config,
        40000,
      );
      notesRepository.rebindDocGuid(note.id, remoteGuid, config.kbGuid);
      if (isRemote) {
        pushed += 1;
      } else {
        created += 1;
      }
    } catch (error) {
      if (createdHere) {
        notesRepository.markDirty(note.id);
      }
      failed += 1;
      errors.push(`${note.title}: ${(error as Error).message}`);
    }
  }
  saveConfig({ lastSyncAt: Date.now() });
  return { pushed, created, failed, errors: errors.slice(0, 10) };
}

/** 清掉遗留的密码（记住密码关闭时用）。 */
export async function clearPassword(): Promise<void> {
  saveConfig({ password: undefined });
}


