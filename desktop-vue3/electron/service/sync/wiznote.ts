import * as wizMarkdown from '@altairwei/wiz-markdown';
import { settingsRepository } from '../db/settings-repository';
import { notesRepository } from '../db/notes-repository';

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
 * 这份只做「登录 / 拉分类 / 拉笔记 / 推 dirty 笔记」，附件资源与冲突合并没做。
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
    return ('result' in payload ? payload.result : payload) as T;
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

export async function fetchCategories(): Promise<WizCategory[]> {
  const config = readConfig();
  if (!config.kbGuid) {
    throw Object.assign(new Error('not logged in'), { code: 'NO_LOGIN' });
  }
  const raw = await request<unknown>('GET', `${config.kbServer}/ks/category/all/${config.kbGuid}`, undefined, config);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { result?: unknown })?.result)
      ? ((raw as { result: unknown[] }).result)
      : [];
  return list
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

/** 为知下载的 HTML → 本地 Markdown；标题以 .md 结尾的走 wizMarkdown 提取。 */
async function toMarkdown(note: DownloadedNote): Promise<string> {
  const title = String(note.info?.title ?? '');
  let html = String(note.html ?? '');
  (note.resources ?? []).forEach((resource) => {
    if (resource?.name) {
      html = html.split(`index_files/${resource.name}`).join(`./${resource.name}`);
    }
  });
  if (title.toLowerCase().endsWith('.md')) {
    return wizMarkdown.extract(html, { convertImgTag: true, normalizeWhitespace: false });
  }
  return htmlToMarkdown(html);
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
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const summary of list) {
    try {
      const note = await download(summary.docGuid);
      const content = await toMarkdown(note);
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
    const isRemote = docGuid && !docGuid.startsWith('local_');
    const html = wizMarkdown.embed(note.content ?? '', {
      wrapWithPreTag: false,
      kbGuid: config.kbGuid,
      docGuid: isRemote ? docGuid : '',
    });
    try {
      if (isRemote) {
        await request(
          'PUT',
          `${config.kbServer}/ks/note/save/${config.kbGuid}/${docGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
          {
            html,
            title: note.title,
            kbGuid: config.kbGuid,
            docGuid,
            resources: [],
            type: 'document',
            tags: note.tags || '',
            category: note.category || '/My Notes/',
          },
          config,
          40000,
        );
        notesRepository.rebindDocGuid(note.id, docGuid, config.kbGuid);
        pushed += 1;
      } else {
        const result = await request<Record<string, unknown>>(
          'POST',
          `${config.kbServer}/ks/note/create/${config.kbGuid}`,
          {
            category: note.category || '/My Notes/',
            kbGuid: config.kbGuid,
            title: note.title || 'Untitled',
            owner: config.email,
            html,
            type: 'document',
            tags: note.tags || '',
          },
          config,
          40000,
        );
        const newGuid = String(result?.guid ?? result?.docGuid ?? '');
        if (!newGuid) {
          throw new Error('createNote returned no guid');
        }
        notesRepository.rebindDocGuid(note.id, newGuid, config.kbGuid);
        created += 1;
      }
    } catch (error) {
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


