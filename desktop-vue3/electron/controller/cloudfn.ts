import type { IpcResult } from '../shared/ipc/contract';
import { cloudFnInvokeSchema } from '../shared/ipc/schemas';
import { fail, ok } from '../shared/ipc/result';
import { settingsRepository } from '../service/db/settings-repository';
import { failFromError } from './controller-utils';

/**
 * 云函数 HTTP 代理（复刻 vue2 services/cloud/CloudFunctionProvider + cloud-router.callFunction）。
 *
 * vue2 在渲染层用 axios 直连 baseUrl；vue3 渲染层是 http://localhost 开发源，
 * 直连会撞 CORS，所以放到主进程用 fetch 发。协议保持一致：POST `${baseUrl}/${url}`，JSON body。
 */
type CloudFnConfig = {
  provider?: string;
  baseUrl?: string;
  appId?: string;
  platform?: string;
  token?: string;
  locale?: string;
};

const CONFIG_KEY = 'setting/cloudFn/config';
const DEFAULT_TIMEOUT = 20000;

function readConfig(): CloudFnConfig {
  const raw = settingsRepository.get(CONFIG_KEY);
  return (raw && typeof raw === 'object' ? raw : {}) as CloudFnConfig;
}

function buildHeaders(config: CloudFnConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (config.provider && config.provider !== 'magicApi') {
    headers['x-app-id'] = config.appId || '';
    headers['x-platform'] = config.platform || 'h5';
    headers['x-locale'] = config.locale || 'zh-Hans';
  }
  if (config.token) {
    headers['uni-id-token'] = config.token;
    headers.authorization = `Bearer ${config.token}`;
  }
  return headers;
}

/** magi c-api / uniCloud 的返回壳千奇百怪，这里只剥一层常见的 data 包装。 */
function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const code = record.code;
    if (typeof code === 'number' && code !== 0 && code !== 200) {
      throw Object.assign(new Error(String(record.message || record.msg || `cloudFn code ${code}`)), {
        code: 'CLOUDFN_BUSINESS_ERROR',
      });
    }
    if ('data' in record && (record.data !== null || record.code !== undefined)) {
      return record.data;
    }
  }
  return payload;
}

class CloudfnController {
  async invoke(args?: unknown): Promise<IpcResult<unknown>> {
    try {
      const { url, data } = cloudFnInvokeSchema.parse(args);
      const config = readConfig();
      const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
      if (!baseUrl) {
        return fail('NO_BASE_URL', 'cloudFn baseUrl is not configured');
      }
      const fullUrl = `${baseUrl}/${url.replace(/^\/+/, '')}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
      try {
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: buildHeaders(config),
          body: JSON.stringify(data ?? {}),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          return fail('TOKEN_REQUIRED', `cloudFn responded ${response.status}`);
        }
        if (!response.ok) {
          return fail(`HTTP_${response.status}`, `cloudFn responded ${response.status}`);
        }
        const payload = (await response.json()) as unknown;
        return ok(unwrap(payload));
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        return fail('TIMEOUT', 'cloudFn request timed out');
      }
      const code = (error as { code?: string })?.code;
      if (code === 'CLOUDFN_BUSINESS_ERROR') {
        return fail(code, String((error as Error).message));
      }
      return failFromError(error, 'CLOUDFN_INVOKE_ERROR');
    }
  }
}

CloudfnController.toString = () => '[class CloudfnController]';

export default CloudfnController;
