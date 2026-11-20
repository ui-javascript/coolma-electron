/**
 * PicGo 本地 HTTP 服务上传（照 vue2 `PicGoUtils.js`）：
 * POST http://127.0.0.1:36677/upload  body { list: [filePath] }，60s 超时。
 * 返回 PicGo 的 result 第一项（字符串 URL，或对象的 url）。
 */
export async function uploadImageByPicGo(
  filePath: string,
  endpoint = 'http://127.0.0.1:36677/upload',
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list: [filePath] }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`PicGo responded ${response.status}`);
    }
    const payload = (await response.json()) as {
      success?: boolean;
      message?: string;
      result?: unknown;
    };
    if (payload.success === false) {
      throw new Error(payload.message || 'PicGo upload failed');
    }
    const first = Array.isArray(payload.result) ? payload.result[0] : payload.result;
    const url =
      typeof first === 'string'
        ? first
        : first && typeof first === 'object' && 'url' in first
          ? String((first as { url?: unknown }).url || '')
          : '';
    if (!url) {
      throw new Error('PicGo returned no image url');
    }
    return url;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('PicGo request timed out (60s)');
    }
    const message = String((error as Error)?.message || error);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new Error('PicGo 本地服务未启动（127.0.0.1:36677）');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
