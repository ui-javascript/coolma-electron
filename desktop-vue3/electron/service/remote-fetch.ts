/**
 * remote-fetch —— GitHub raw URL 抓取（复刻 vue2 remote-fetch.js）。
 * 只允许 github.com / raw.githubusercontent.com / gist.githubusercontent.com，防 SSRF。
 * 返回 { success, code, message, text?, finalUrl? }，不做 JSON 解析。
 */
const MAX_REDIRECTS = 8;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const SOCKET_IDLE_TIMEOUT_MS = 20_000;

const ALLOWED_HOSTS = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
]);

export interface RemoteFetchResult {
  success: boolean;
  code?: string;
  message?: string;
  text?: string;
  finalUrl?: string;
}

function toRawGithubUrl(input: string): string | null {
  if (typeof input !== 'string' || !input.trim()) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) {
    return url.toString();
  }
  if (host === 'github.com') {
    // /<u>/<r>/blob|raw/<branch>/<path> → raw
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    if (match) {
      return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
    }
    return null;
  }
  return null;
}

async function fetchOnce(url: string, redirectsLeft: number): Promise<Response> {
  if (redirectsLeft <= 0) {
    throw new Error('Too many redirects');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOCKET_IDLE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect without location');
      }
      const next = new URL(location, url).toString();
      return fetchOnce(next, redirectsLeft - 1);
    }
    if (status !== 200) {
      throw new Error(`HTTP ${status}`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BODY_BYTES) {
      throw new Error('Response body too large');
    }
    return { ok: true, text: () => new TextDecoder().decode(buffer) } as unknown as Response;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRemoteText(input: string): Promise<RemoteFetchResult> {
  const raw = toRawGithubUrl(input);
  if (!raw) {
    return {
      success: false,
      code: 'INVALID_URL',
      message: '只支持 github.com / raw.githubusercontent.com / gist.githubusercontent.com 形式的 URL',
    };
  }
  let body: string;
  try {
    const response = await fetchOnce(raw, MAX_REDIRECTS);
    body = await response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    let code = 'FETCH_FAILED';
    if (/Too many redirects/i.test(msg)) {
      code = 'REDIRECT_LOOP';
    } else if (/too large/i.test(msg)) {
      code = 'TOO_LARGE';
    }
    return { success: false, code, message: msg };
  }
  if (!body || !body.trim()) {
    return { success: false, code: 'EMPTY_BODY', message: '远端返回内容为空' };
  }
  return { success: true, text: body, finalUrl: raw };
}
