import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import * as wizMarkdown from '@altairwei/wiz-markdown';
import { settingsRepository } from '../db/settings-repository';
import { notesRepository, normalizeCategory } from '../db/notes-repository';
import { syncLogRepository } from '../db/sync-log-repository';
import { categoriesRepository } from '../db/categories-repository';
import { ATTACHMENT_ROOT_NAME, parseCoolmaUrl } from '../attachments';
import { isLiteCategory, replaceCoolmaWithIndexFiles, replaceIndexFilesWithCoolma } from './wiznote-resources';
import {
  findCloudNoteByTitle,
  isCategoryExistsError,
  isNoteMissingError,
  normalizeMatchCategory,
  sortCategoriesByDepth,
  toWizCategoryInput,
  toWizRemoteCategory,
} from './push-rules';
import { buildNoteListQuery, stripWizMarkdownSuffix } from './pull-rules';
import { cloudTagsToNames, localNamesToCloudTags } from './tag-rules';

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
      throw Object.assign(new Error(`WizNote responded ${response.status}`), {
        code: 'TOKEN_REQUIRED',
        status: response.status,
      });
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const code = Number(payload.returnCode ?? payload.code ?? 200);
    if (code !== 200) {
      throw Object.assign(
        new Error(String(payload.returnMessage ?? payload.message ?? `WizNote code ${code}`)),
        { code, status: response.status },
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
  const saved = saveConfig({
    baseUrl,
    token: String(result.token ?? ''),
    kbGuid: String(result.kbGuid ?? ''),
    kbServer: trimBase(String(result.kbServer ?? '')),
    email: String(result.email ?? input.userId),
    displayName: String(result.displayName ?? ''),
    userGuid: String(result.userGuid ?? ''),
    password: input.rememberPassword ? input.password : undefined,
  });
  // 照 vue2 登录/重登录：把 kb_guid 为空的离线笔记与目录归属到当前账号，等下次推送。
  if (saved.kbGuid) {
    // 照 vue2：两段迁移各自 try/catch，失败只 warn，绝不阻断登录。
    try {
      notesRepository.migrateOffline(saved.kbGuid);
    } catch (error) {
      console.warn('[sync] 离线笔记迁移失败', (error as Error).message);
    }
    try {
      categoriesRepository.migrateOffline(saved.kbGuid);
    } catch (error) {
      console.warn('[sync] 离线目录迁移失败', (error as Error).message);
    }
  }
  return getPublicConfig();
}

/**
 * 启动自动登录：只使用上次记住的密码，密码不在渲染层暴露。
 * 没有邮箱/密码时返回 null，由渲染层决定走本地离线。
 */
export async function autoLogin(): Promise<ReturnType<typeof getPublicConfig> | null> {
  const config = readConfig();
  if (!config.email || !config.password) {
    return null;
  }
  return login({
    userId: config.email,
    password: config.password,
    baseUrl: config.baseUrl,
    rememberPassword: true,
  });
}

export async function logout(): Promise<ReturnType<typeof getPublicConfig>> {
  const config = readConfig();
  if (config.token) {
    try {
      await request('GET', `${config.baseUrl}/as/user/logout`, undefined, config, 10000);
    } catch {
      // 账号服务登出失败不影响本地登出：token 照清。
    }
  }
  // 照 vue2 logout：笔记解除账号归属并标脏、目录退回离线；数据一条不删。
  if (config.kbGuid) {
    try {
      notesRepository.detachFromKb(config.kbGuid);
    } catch (error) {
      console.warn('[sync] 登出解除笔记归属失败', (error as Error).message);
    }
    try {
      categoriesRepository.detachFromKb(config.kbGuid);
    } catch (error) {
      console.warn('[sync] 登出解除目录归属失败', (error as Error).message);
    }
  }
  saveConfig({ token: '', kbGuid: '', kbServer: '' });
  return getPublicConfig();
}

export interface WizTag {
  name: string;
  tagGuid: string;
}

interface TagMaps {
  nameToGuid: Map<string, string>;
  guidToName: Map<string, string>;
  knownGuid: Set<string>;
}

function emptyTagMaps(): TagMaps {
  return { nameToGuid: new Map(), guidToName: new Map(), knownGuid: new Set() };
}

/** 云端标签列表；照 vue2 `KnowledgeBaseApi.getAllTags` → GET {kbServer}/ks/tag/all/{kbGuid}。 */
async function fetchCloudTags(config: WizConfig): Promise<WizTag[]> {
  const payload = await request<Record<string, unknown>>(
    'GET',
    `${config.kbServer}/ks/tag/all/${config.kbGuid}`,
    undefined,
    config,
    30000,
    false,
  );
  const raw = payload.result ?? payload;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { tags?: unknown })?.tags)
      ? ((raw as { tags: unknown[] }).tags)
      : [];
  return list
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        name: String(row?.name ?? '').trim(),
        tagGuid: String(row?.tagGuid ?? row?.guid ?? '').trim(),
      };
    })
    .filter((tag) => tag.name && tag.tagGuid);
}

/** 在线创建标签；照 vue2 `KnowledgeBaseApi.createTag` → POST /ks/tag/create/{kbGuid}。 */
async function createCloudTag(config: WizConfig, name: string): Promise<WizTag> {
  const payload = await request<Record<string, unknown>>(
    'POST',
    `${config.kbServer}/ks/tag/create/${config.kbGuid}`,
    { name, parentTagGuid: '' },
    config,
    30000,
    false,
  );
  const raw = (payload.result ?? payload) as Record<string, unknown>;
  return {
    name: String(raw?.name ?? name),
    tagGuid: String(raw?.tagGuid ?? raw?.guid ?? ''),
  };
}

async function readTagMaps(config: WizConfig): Promise<TagMaps> {
  const maps = emptyTagMaps();
  for (const tag of await fetchCloudTags(config)) {
    const guid = tag.tagGuid.toLowerCase();
    maps.nameToGuid.set(tag.name.toLowerCase(), tag.tagGuid);
    maps.guidToName.set(guid, tag.name);
    maps.knownGuid.add(guid);
  }
  return maps;
}

function requireTagConfig(): WizConfig {
  const config = readConfig();
  if (!config.token || !config.kbGuid || !config.kbServer) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  return config;
}

/** 标签面板新建：云端已有同名就复用，没有就按 vue2 createTag 建一个。 */
export async function syncCreateRemoteTag(name: string): Promise<void> {
  const config = requireTagConfig();
  const maps = await readTagMaps(config);
  if (maps.nameToGuid.has(name.toLowerCase())) {
    return;
  }
  const created = await createCloudTag(config, name);
  if (!created.tagGuid) {
    throw new Error('Failed to create remote tag');
  }
}

/** 标签面板改名：云端有旧名就改名；离线标签尚未上云时直接建新名。 */
export async function syncRenameRemoteTag(fromName: string, toName: string): Promise<void> {
  const config = requireTagConfig();
  const maps = await readTagMaps(config);
  const guid = maps.nameToGuid.get(fromName.toLowerCase());
  if (!guid) {
    if (!maps.nameToGuid.has(toName.toLowerCase())) {
      await createCloudTag(config, toName);
    }
    return;
  }
  await request(
    'PUT',
    `${config.kbServer}/ks/tag/rename/${config.kbGuid}`,
    { tagGuid: guid, name: toName },
    config,
    30000,
    false,
  );
}

/** 标签面板删除：按名称找到云端 GUID 再删；离线标签没上云时无需请求。 */
export async function syncDeleteRemoteTag(name: string): Promise<void> {
  const config = requireTagConfig();
  const maps = await readTagMaps(config);
  const guid = maps.nameToGuid.get(name.toLowerCase());
  if (!guid) {
    return;
  }
  await request(
    'DELETE',
    `${config.kbServer}/ks/tag/delete/${config.kbGuid}/${guid}`,
    undefined,
    config,
    30000,
    false,
  );
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
  // 目录接口返回的是完整云端目录，必须落到 local_categories；
  // 否则登录后侧栏只读本地旧目录，空文件夹和新文件夹都不会出现。
  const config = readConfig();
  if (config.kbGuid) {
    for (const item of directory.items) {
      // 云端根目录（'/My Notes/'、'/'、空串）归一后就是 '/'，侧栏已有虚拟
      // “我的笔记”节点承载它，local_categories 不接受根节点
      // （normalizeCategory 后为 '/' 会抛 Category is required），直接跳过。
      if (normalizeCategory(item.category) === '/') {
        continue;
      }
      try {
        categoriesRepository.create({
          category: item.category,
          parent: item.parent,
          kbGuid: config.kbGuid,
          localOnly: false,
        });
      } catch (error) {
        console.warn('[sync] 云端目录落库失败', item.category, (error as Error).message);
      }
    }
  }
  return directory.items;
}

/** 在线创建云端目录；照 vue2 `KnowledgeBaseApi.createCategory`。 */
export async function createRemoteCategory(input: {
  category: string;
  kbGuid?: string;
}): Promise<void> {
  const config = readConfig();
  const kbGuid = input.kbGuid || config.kbGuid;
  if (!config.token || !kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  if (normalizeMatchCategory(input.category) === '/') {
    throw new Error('Root category cannot be created');
  }
  const { parent, child } = toWizCategoryInput(toWizRemoteCategory(input.category));
  if (!child) {
    throw new Error('Category is required');
  }
  await request(
    'POST',
    `${config.kbServer}/ks/category/create/${kbGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
    { parent, pos: Math.floor(Date.now() / 1000).toFixed(0), child },
    config,
    30000,
    false,
  );
}

/** 在线删除云端目录；照 vue2 `deleteCategory`，失败由调用方决定是否吞掉。 */
export async function deleteRemoteCategory(input: {
  category: string;
  kbGuid?: string;
}): Promise<void> {
  const config = readConfig();
  const kbGuid = input.kbGuid || config.kbGuid;
  if (!config.token || !kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  if (normalizeMatchCategory(input.category) === '/') {
    throw new Error('Root category cannot be deleted');
  }
  const category = toWizRemoteCategory(input.category);
  const query = new URLSearchParams({ category });
  await request(
    'DELETE',
    `${config.kbServer}/ks/category/delete/${kbGuid}?${query.toString()}`,
    undefined,
    config,
    30000,
    false,
  );
}

export interface WizNoteSummary {
  docGuid: string;
  title: string;
  category: string;
  dataModified: number;
  dataCreated: number;
  abstract: string;
}

export async function listNotes(category = '/', limit = 100, start = 0): Promise<WizNoteSummary[]> {
  const config = readConfig();
  const query = buildNoteListQuery({ category, limit, start });
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
  skipped: number;
  backfilled: number;
  failed: number;
  total: number;
  errors: string[];
}

const PULL_PAGE_SIZE = 100;
const PULL_MAX_NOTES = 10000;

/**
 * 拉取云端列表：分页直到取空。
 * vue2 `_fetchAllCloudDocs` 用 `category:''` 取全库、每页 100；这里多一层 docGuid 去重，
 * 防止服务端忽略 start 时死循环，也防止同一篇跨页重复。
 */
async function collectCloudNotes(category: string, limit?: number): Promise<WizNoteSummary[]> {
  const cap = Math.min(Math.max(1, limit ?? PULL_MAX_NOTES), PULL_MAX_NOTES);
  const items: WizNoteSummary[] = [];
  const seen = new Set<string>();
  let start = 0;
  while (items.length < cap) {
    const batch = await listNotes(category, PULL_PAGE_SIZE, start);
    if (batch.length === 0) {
      break;
    }
    let added = 0;
    for (const summary of batch) {
      if (!summary.docGuid || seen.has(summary.docGuid)) {
        continue;
      }
      seen.add(summary.docGuid);
      items.push(summary);
      added += 1;
      if (items.length >= cap) {
        break;
      }
    }
    // 整页都是旧 guid，说明服务端没认 start，继续翻只会死循环。
    if (added === 0 && batch.length === PULL_PAGE_SIZE) {
      break;
    }
    if (items.length >= cap || batch.length < PULL_PAGE_SIZE) {
      break;
    }
    start += PULL_PAGE_SIZE;
  }
  return items;
}

/**
 * 拉取云端笔记，落进本地 SQLite（dirty=0）。
 * 默认取全库（vue2 `pullFromCloud` 的 `category:''`），显式 category 只用于单目录排查。
 */
export async function pull(input: { category?: string; limit?: number } = {}): Promise<PullResult> {
  const config = readConfig();
  if (!config.token || !config.kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  const list = await collectCloudNotes(input.category ?? '', input.limit);
  // 分类顺序是服务端 pos，拉笔记时顺手刷一次；失败不影响笔记导入。
  try {
    await fetchCategories();
  } catch {
    // 分类接口失败不阻断 pull
  }
  let imported = 0;
  let skipped = 0;
  let backfilled = 0;
  let failed = 0;
  const errors: string[] = [];
  let tagMaps = emptyTagMaps();
  try {
    // 云端 tags 是 GUID，本地按名称展示；拉取前统一取一次标签表做映射。
    tagMaps = await readTagMaps(config);
  } catch (error) {
    console.warn('[sync] 标签表拉取失败，tags 按原值落库', (error as Error).message);
  }

  for (const summary of list) {
    const docGuid = summary.docGuid;
    if (!docGuid) {
      skipped += 1;
      continue;
    }

    const existing = notesRepository.getByDocGuid(docGuid);
    if (existing && existing.docGuid && !existing.docGuid.startsWith('local_')) {
      // vue2 对已存在的云端笔记不覆盖；只有本地正文为空时才回填。
      if (String(existing.content ?? '').trim()) {
        skipped += 1;
        continue;
      }
      try {
        const note = await download(docGuid);
        const { content, missing } = await toMarkdown(note, config, docGuid);
        if (missing > 0) {
          errors.push(`${summary.title}: ${missing} 个附件未能缓存`);
        }
        const remoteCategory = String(note.info?.category ?? summary.category);
        const remoteTitle = stripWizMarkdownSuffix(note.info?.title ?? summary.title) || 'Untitled';
        const conflict = notesRepository.findByTitleCategory({ category: remoteCategory, title: remoteTitle, kbGuid: config.kbGuid });
        if (conflict && conflict.docGuid !== docGuid) {
          skipped += 1;
          continue;
        }
        notesRepository.upsertRemote({
          docGuid,
          kbGuid: config.kbGuid,
          title: remoteTitle,
          content,
          category: remoteCategory,
          tags: cloudTagsToNames(String(note.info?.tags ?? ''), tagMaps.guidToName),
          serverModified: Number(note.info?.dataModified ?? summary.dataModified) || null,
        });
        backfilled += 1;
      } catch (error) {
        failed += 1;
        errors.push(`${summary.title}: ${(error as Error).message}`);
      }
      continue;
    }

    // 同分类 + 同标题 + 当前账号已存在 → 跳过，不覆盖本地（vue2 localNoteSet 去重）。
    // 云端标题常带 .md，落库会去掉；查重也必须先去掉，否则会撞唯一索引。
    const localMatch = notesRepository.findByTitleCategory({
      category: String(summary.category ?? ''),
      title: stripWizMarkdownSuffix(summary.title) || 'Untitled',
      kbGuid: config.kbGuid,
    });
    if (localMatch) {
      skipped += 1;
      continue;
    }

    try {
      const note = await download(docGuid);
      const { content, missing } = await toMarkdown(note, config, docGuid);
      if (missing > 0) {
        errors.push(`${summary.title}: ${missing} 个附件未能缓存`);
      }
      const remoteCategory = String(note.info?.category ?? summary.category);
      const remoteTitle = stripWizMarkdownSuffix(note.info?.title ?? summary.title) || 'Untitled';
      // 云端可能有两篇不同 docGuid、但标题/分类相同的笔记；本地只能留一篇。
      const conflict = notesRepository.findByTitleCategory({ category: remoteCategory, title: remoteTitle, kbGuid: config.kbGuid });
      if (conflict && conflict.docGuid !== docGuid) {
        skipped += 1;
        continue;
      }
      notesRepository.upsertRemote({
        docGuid,
        kbGuid: config.kbGuid,
        title: remoteTitle,
        content,
        category: remoteCategory,
        tags: cloudTagsToNames(String(note.info?.tags ?? ''), tagMaps.guidToName),
        serverModified: Number(note.info?.dataModified ?? summary.dataModified) || null,
      });
      imported += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${summary.title}: ${(error as Error).message}`);
    }
  }
  saveConfig({ lastSyncAt: Date.now() });
  return { imported, skipped, backfilled, failed, total: list.length, errors: errors.slice(0, 10) };
}

export interface PushResult {
  pushed: number;
  created: number;
  failed: number;
  deleted?: number;
  errors: string[];
}

/** 拉某分类下全部笔记（每页 100，最多 20 页），用于同名同目录匹配。 */
async function listCategoryNotes(category: string): Promise<WizNoteSummary[]> {
  const pageSize = 100;
  const all: WizNoteSummary[] = [];
  for (let page = 0; page < 20; page += 1) {
    const batch = await listNotes(category, pageSize, page * pageSize);
    all.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }
  return all;
}

async function findCloudNoteInCategory(
  cache: Map<string, WizNoteSummary[]>,
  input: { title: string; category: string },
): Promise<WizNoteSummary | null> {
  const key = input.category || '/';
  if (!cache.has(key)) {
    cache.set(key, await listCategoryNotes(key));
  }
  return findCloudNoteByTitle(cache.get(key) ?? [], input);
}

async function deleteRemoteNote(docGuid: string, kbGuid: string): Promise<void> {
  const config = readConfig();
  await request(
    'DELETE',
    `${config.kbServer}/ks/note/delete/${kbGuid}/${docGuid}`,
    undefined,
    config,
    40000,
  );
}

async function saveRemoteNote(
  config: WizConfig,
  docGuid: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await request(
    'PUT',
    `${config.kbServer}/ks/note/save/${config.kbGuid}/${docGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
    { ...payload, docGuid },
    config,
    40000,
  );
}

/**
 * 推送前把离线创建的目录补到云端。
 * 父目录先建；云端已存在（400/409/exists）按 vue2 幂等处理，直接标已同步。
 */
async function syncLocalCategoriesToCloud(config: WizConfig): Promise<{ synced: number; total: number }> {
  const pending = sortCategoriesByDepth(categoriesRepository.listLocalOnly(config.kbGuid));
  let synced = 0;
  for (const item of pending) {
    try {
      await createRemoteCategory({ category: item.category, kbGuid: config.kbGuid });
      categoriesRepository.markSynced(item.category, config.kbGuid);
      synced += 1;
    } catch (error) {
      if (isCategoryExistsError(error)) {
        categoriesRepository.markSynced(item.category, config.kbGuid);
        synced += 1;
      } else {
        // 目录补建失败不阻断笔记推送，和 vue2 一致：只记日志继续。
        console.warn('[sync] 目录补建失败', item.category, (error as Error).message);
      }
    }
  }
  return { synced, total: pending.length };
}

/** 推本地 dirty 笔记：删除日志 → 离线目录 → 更新/同名匹配/新建，全部本地优先。 */
export async function push(input: { limit?: number } = {}): Promise<PushResult> {
  const config = readConfig();
  if (!config.token || !config.kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }

  let pushed = 0;
  let created = 0;
  let failed = 0;
  let deleted = 0;
  const errors: string[] = [];

  // vue2 推送顺序：先补目录，再删云端笔记，最后推 dirty 笔记。
  try {
    await syncLocalCategoriesToCloud(config);
  } catch (error) {
    errors.push(`目录同步失败：${(error as Error).message}`);
  }

  // 只处理当前账号的删除日志；换账号后旧账号日志留到下次登录再销，避免误删别人的云端笔记。
  for (const log of syncLogRepository.listPendingDeletes(200, config.kbGuid)) {
    const docGuid = log.docGuid ?? '';
    if (!docGuid || docGuid.startsWith('local_')) {
      // 从未上过云端的笔记，没有可删的远端对象，直接销账，避免日志永久积压。
      syncLogRepository.markSynced([log.id]);
      continue;
    }
    try {
      await deleteRemoteNote(docGuid, log.kbGuid || config.kbGuid);
      syncLogRepository.markSynced([log.id]);
      deleted += 1;
    } catch (error) {
      errors.push(`删除云端笔记 ${docGuid} 失败：${(error as Error).message}`);
    }
  }
  syncLogRepository.purgeSyncedDeletes();

  const notes = notesRepository.listDirty(input.limit || 50, config.kbGuid);
  const cloudCache = new Map<string, WizNoteSummary[]>();
  let tagMaps = emptyTagMaps();
  let tagsReady = false;
  try {
    // 本地标签是名称、云端是 GUID：推送前取一次标签表，缺的标签按 vue2 现场创建。
    tagMaps = await readTagMaps(config);
    tagsReady = true;
  } catch (error) {
    console.warn('[sync] 标签表拉取失败，本次不写 tags', (error as Error).message);
  }
  const tagCreateFailed = new Set<string>();

  for (const note of notes) {
    const docGuid = note.docGuid ?? '';
    const isRemote = Boolean(docGuid) && !docGuid.startsWith('local_');
    const isLite = isLiteCategory(note.category);
    const category = toWizRemoteCategory(note.category);
    const { html, names } = toWizHtml(note.content ?? '', isLite, config, docGuid, isRemote ? docGuid : '');
    const resources = names.map((name) => ({ name }));
    let cloudTags: string | undefined;
    if (tagsReady) {
      let mapped = localNamesToCloudTags(note.tags, tagMaps.nameToGuid, tagMaps.knownGuid);
      for (const name of mapped.missing) {
        if (tagCreateFailed.has(name.toLowerCase())) {
          continue;
        }
        try {
          const created = await createCloudTag(config, name);
          if (!created.tagGuid) {
            tagCreateFailed.add(name.toLowerCase());
            continue;
          }
          const guid = created.tagGuid.toLowerCase();
          tagMaps.nameToGuid.set(created.name.toLowerCase(), created.tagGuid);
          tagMaps.guidToName.set(guid, created.name);
          tagMaps.knownGuid.add(guid);
        } catch (error) {
          tagCreateFailed.add(name.toLowerCase());
          console.warn('[sync] 标签创建失败', name, (error as Error).message);
        }
      }
      mapped = localNamesToCloudTags(note.tags, tagMaps.nameToGuid, tagMaps.knownGuid);
      cloudTags = mapped.tags;
    }
    const payload = {
      html,
      title: note.title,
      kbGuid: config.kbGuid,
      resources,
      type: isLite ? 'lite/markdown' : 'document',
      ...(cloudTags === undefined ? {} : { tags: cloudTags }),
      category,
    };

    let remoteGuid = isRemote ? docGuid : '';
    let createdHere = false;
    try {
      // 1) 已有云端 GUID：先试更新。2004 表示云端已删，退回「找同名/新建」。
      if (remoteGuid) {
        try {
          await saveRemoteNote(config, remoteGuid, payload);
        } catch (error) {
          if (isNoteMissingError(error)) {
            remoteGuid = '';
          } else {
            throw error;
          }
        }
      }

      // 2) 无 GUID / local_ / 刚被 2004 清空：先找同目录同名笔记，有就覆盖，避免重复建。
      if (!remoteGuid) {
        try {
          const matched = await findCloudNoteInCategory(cloudCache, { title: note.title, category });
          if (matched?.docGuid) {
            remoteGuid = matched.docGuid;
            try {
              await saveRemoteNote(config, remoteGuid, payload);
            } catch (error) {
              if (isNoteMissingError(error)) {
                remoteGuid = '';
                cloudCache.delete(category || '/');
              } else {
                throw error;
              }
            }
          }
        } catch (error) {
          // 匹配接口挂了不阻断新建，和 vue2 一样降级 continue。
          console.warn('[sync] 同名目录匹配失败', note.title, (error as Error).message);
        }
      }

      // 3) 仍未命中：新建云端笔记，并先绑 guid，失败时不会重复建。
      if (!remoteGuid) {
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
        notesRepository.bindRemoteGuid(note, remoteGuid, config.kbGuid);
        cloudCache.get(category || '/')?.push({
          docGuid: remoteGuid,
          title: note.title,
          category,
          dataModified: Date.now(),
          dataCreated: Date.now(),
          abstract: '',
        });
      }

      // 4) 附件上传到最终 guid，再 save 一次把 index_files 绑定上。
      for (const item of collectResources(note.content ?? '')) {
        try {
          const buffer = await readFile(item.filePath);
          await uploadResource(config, remoteGuid, item.name, buffer);
        } catch (error) {
          errors.push(`${note.title}: 附件 ${item.name} 上传失败 ${(error as Error).message}`);
        }
      }
      await saveRemoteNote(config, remoteGuid, payload);

      notesRepository.acknowledgePush(note, remoteGuid, config.kbGuid);
      if (createdHere) {
        created += 1;
      } else {
        pushed += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push(`${note.title}: ${(error as Error).message}`);
    }
  }
  saveConfig({ lastSyncAt: Date.now() });
  return { pushed, created, failed, deleted, errors: errors.slice(0, 10) };
}

/** 清掉遗留的密码（记住密码关闭时用）。 */
export async function clearPassword(): Promise<void> {
  saveConfig({ password: undefined });
}


