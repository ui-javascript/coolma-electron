import { BrowserWindow, safeStorage } from 'electron';
import type { IpcResult } from '../shared/ipc/contract';
import { ok, toErrorMessage } from '../shared/ipc/result';
import {
  aiModelsRepository,
  aiSkillsRepository,
  type AiModelRawRow,
} from '../service/db/ai-repository';
import {
  aiChatCancelSchema,
  aiChatSchema,
  aiChatStreamSchema,
  aiModelSaveSchema,
  aiSkillSaveSchema,
  aiIdSchema,
} from '../shared/ipc/schemas';
import { IPC_EVENTS } from '../shared/ipc/channels';
import { drainSseDataLines, extractDeltaText } from '../service/ai/sse';
import { failFromError } from './controller-utils';

const PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible';
const AI_KEY_ENCRYPT_VERSION = 2;

function maskKey(key: string): string {
  if (!key) {
    return '';
  }
  if (key.length <= 8) {
    return `${key.slice(0, 2)}***`;
  }
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function encryptKey(plain: string): { encrypted: string; version: number } {
  if (!plain) {
    return { encrypted: '', version: 0 };
  }
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: safeStorage.encryptString(plain).toString('base64'), version: AI_KEY_ENCRYPT_VERSION };
  }
  throw new Error('AI_KEY_ENCRYPTION_UNAVAILABLE');
}

function decryptKey(encrypted: string, version: number): string {
  if (!encrypted) {
    return '';
  }
  if (version === AI_KEY_ENCRYPT_VERSION) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return '';
}

function toModelView(row: AiModelRawRow) {
  const apiKey = decryptKey(row.apiKeyEncrypted, row.apiKeyEncryptedVersion);
  const virtualKey = decryptKey(row.virtualKeyEncrypted, row.virtualKeyEncryptedVersion);
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    baseUrl: row.baseUrl,
    model: row.model,
    isDefault: row.isDefault,
    enabled: row.enabled,
    headersJson: row.headersJson,
    extraConfigJson: row.extraConfigJson,
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: maskKey(apiKey),
    hasVirtualKey: Boolean(virtualKey),
    virtualKeyMasked: maskKey(virtualKey),
  };
}

function parseJsonField(text: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** openai-compatible 连通性测试：POST {base}/chat/completions，max_tokens=8（对齐 vue2）。 */
async function testOpenAiCompatible(config: AiModelRawRow): Promise<void> {
  const headers = parseJsonField(config.headersJson);
  const extraConfig = parseJsonField(config.extraConfigJson);
  const url = `${String(config.baseUrl || '').replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${decryptKey(config.apiKeyEncrypted, config.apiKeyEncryptedVersion)}`,
      ...headers,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      model: config.model,
      temperature: 0,
      max_tokens: 8,
      ...extraConfig,
      stream: false,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }
  await response.json();
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return '';
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : String((part as { text?: unknown })?.text ?? '')))
      .join('');
  }
  return '';
}

function broadcastAiChunk(requestId: string, delta: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_EVENTS.aiChatStream, { requestId, delta });
    }
  }
}

interface AiChatOutput {
  content: string;
  finishReason: string | null;
  truncated: boolean;
  model: string;
  usage: unknown;
  stopped?: boolean;
}

interface ActiveAiStream {
  controller: AbortController;
  content: string;
  finishReason: string | null;
  model: string;
  usage: unknown;
  stopped: boolean;
}

/** 正在跑的流式请求；key 为渲染层生成的 requestId，取消时按它找 AbortController。 */
const AI_STREAMS = new Map<string, ActiveAiStream>();

/** 解析默认可用模型：默认优先，其次任意启用中的模型（与 vue2 getDefaultConfig 口径一致）。 */
function resolveChatConfig(modelId?: number): AiModelRawRow | null {
  const rows = aiModelsRepository.list();
  if (modelId) {
    return rows.find((row) => row.id === modelId) ?? null;
  }
  return rows.find((row) => row.isDefault && row.enabled) ?? rows.find((row) => row.enabled) ?? null;
}

function assertConfigUsable(config: AiModelRawRow): string[] {
  const missing: string[] = [];
  if (!config.baseUrl.trim()) {
    missing.push('base_url');
  }
  if (!config.model.trim()) {
    missing.push('model');
  }
  if (!config.apiKeyEncrypted) {
    missing.push('api_key');
  }
  return missing;
}

/** AI 模型配置 / 技能（复刻 vue2 db:getAiModelConfigs 系列通道）。 */
class AiController {
  async models(): Promise<IpcResult<ReturnType<typeof toModelView>[]>> {
    try {
      return ok(aiModelsRepository.list().map(toModelView));
    } catch (error) {
      return failFromError(error, 'AI_MODELS_ERROR');
    }
  }

  async saveModel(args?: unknown): Promise<IpcResult<ReturnType<typeof toModelView>>> {
    try {
      const input = aiModelSaveSchema.parse(args ?? {});
      const existing = input.id ? aiModelsRepository.get(input.id) : null;
      if (input.id && !existing) {
        return { ok: false, error: { code: 'AI_MODEL_NOT_FOUND', message: '模型配置不存在' } };
      }
      if (!existing) {
        const apiKey = String(input.apiKey ?? '').trim();
        const virtualKey = String(input.virtualKey ?? '').trim();
        const missingSecret = input.providerType === 'portkey'
          ? !apiKey || !virtualKey
          : !apiKey;
        if (missingSecret) {
          return { ok: false, error: { code: 'AI_MODEL_SECRET_REQUIRED', message: '新建模型缺少密钥' } };
        }
      }
      const encrypted: Record<string, unknown> = {};
      if (input.clearApiKey) {
        encrypted.apiKeyEncrypted = '';
        encrypted.apiKeyEncryptedVersion = 0;
      } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
        const result = encryptKey(input.apiKey.trim());
        encrypted.apiKeyEncrypted = result.encrypted;
        encrypted.apiKeyEncryptedVersion = result.version;
      }
      if (input.clearVirtualKey) {
        encrypted.virtualKeyEncrypted = '';
        encrypted.virtualKeyEncryptedVersion = 0;
      } else if (typeof input.virtualKey === 'string' && input.virtualKey.trim()) {
        const result = encryptKey(input.virtualKey.trim());
        encrypted.virtualKeyEncrypted = result.encrypted;
        encrypted.virtualKeyEncryptedVersion = result.version;
      }
      const saved = aiModelsRepository.save({
        id: input.id,
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        model: input.model,
        isDefault: input.isDefault,
        enabled: input.enabled,
        headersJson: input.headersJson,
        extraConfigJson: input.extraConfigJson,
        ...encrypted,
      });
      return ok(toModelView(saved));
    } catch (error) {
      const rawCode = toErrorMessage(error);
      const code = [
        'AI_MODEL_REQUIRED_FIELDS',
        'AI_MODEL_DUPLICATE_NAME',
        'AI_MODEL_NOT_FOUND',
        'AI_MODEL_SECRET_REQUIRED',
      ].includes(rawCode)
        ? rawCode
        : 'AI_MODEL_SAVE_ERROR';
      return failFromError(error, code);
    }
  }

  async removeModel(args?: unknown): Promise<IpcResult<boolean>> {
    try {
      const { id } = aiIdSchema.parse(args ?? {});
      return ok(aiModelsRepository.remove(id));
    } catch (error) {
      return failFromError(error, 'AI_MODEL_REMOVE_ERROR');
    }
  }

  async setDefaultModel(args?: unknown): Promise<IpcResult<boolean>> {
    try {
      const { id } = aiIdSchema.parse(args ?? {});
      return ok(aiModelsRepository.setDefault(id));
    } catch (error) {
      return failFromError(error, 'AI_MODEL_SET_DEFAULT_ERROR');
    }
  }

  async testModel(args?: unknown): Promise<IpcResult<true>> {
    try {
      const { id } = aiIdSchema.parse(args ?? {});
      const config = aiModelsRepository.get(id);
      if (!config) {
        return { ok: false, error: { code: 'AI_MODEL_NOT_FOUND', message: '模型配置不存在' } };
      }
      const missing: string[] = [];
      if (!config.baseUrl.trim()) {
        missing.push('base_url');
      }
      if (!config.model.trim()) {
        missing.push('model');
      }
      if (!config.apiKeyEncrypted) {
        missing.push('api_key');
      }
      if (missing.length > 0) {
        return { ok: false, error: { code: 'AI_MODEL_INCOMPLETE', message: `缺少字段: ${missing.join(', ')}` } };
      }
      if (config.providerType !== PROVIDER_OPENAI_COMPATIBLE) {
        return { ok: false, error: { code: 'AI_MODEL_UNSUPPORTED_PROVIDER', message: '暂只支持 openai-compatible 连通测试' } };
      }
      await testOpenAiCompatible(config);
      return ok(true);
    } catch (error) {
      return failFromError(error, 'AI_MODEL_TEST_FAILED');
    }
  }

  /**
   * 通用 chat 补全（autoTag / 后续 AI 功能共用）。
   * API Key 只在主进程解密，渲染层拿不到明文。
   */
  async chat(args?: unknown): Promise<IpcResult<AiChatOutput>> {
    try {
      const input = aiChatSchema.parse(args ?? {});
      const config = resolveChatConfig(input.modelId);
      if (!config) {
        return { ok: false, error: { code: 'AI_TAG_NO_DEFAULT_CONFIG', message: '没有可用的 AI 模型配置' } };
      }
      const missing = assertConfigUsable(config);
      if (missing.length > 0) {
        return {
          ok: false,
          error: { code: 'AI_TAG_CONFIG_INCOMPLETE', message: `缺少字段: ${missing.join(', ')}` },
        };
      }
      if (config.providerType !== PROVIDER_OPENAI_COMPATIBLE) {
        return { ok: false, error: { code: 'AI_MODEL_UNSUPPORTED_PROVIDER', message: '暂只支持 openai-compatible' } };
      }

      const headers = parseJsonField(config.headersJson);
      const extraConfig = parseJsonField(config.extraConfigJson);
      const url = `${String(config.baseUrl || '').replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${decryptKey(config.apiKeyEncrypted, config.apiKeyEncryptedVersion)}`,
          ...headers,
        },
        body: JSON.stringify({
          model: config.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 1024,
          ...extraConfig,
          stream: false,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return { ok: false, error: { code: 'AI_CHAT_HTTP_ERROR', message: errorText || `HTTP ${response.status}` } };
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: unknown; finish_reason?: string }>;
        model?: string;
        usage?: unknown;
      };
      const choice = payload.choices?.[0];
      const content = extractMessageText(choice?.message);
      const finishReason = choice?.finish_reason ?? null;
      const truncated = finishReason === 'length';
      return ok({
        content,
        finishReason,
        truncated,
        model: String(payload.model || config.model || 'unknown'),
        usage: payload.usage ?? null,
      });
    } catch (error) {
      return failFromError(error, 'AI_CHAT_ERROR');
    }
  }

  /**
   * 流式 chat（对齐 vue2 SSE 逐字回显）：边读边把 delta 发到渲染层，
   * invoke 本身仍等整段结束并返回最终结果，避免渲染层再维护一套收尾协议。
   */
  async chatStream(args?: unknown): Promise<IpcResult<AiChatOutput>> {
    let stream: ActiveAiStream | null = null;
    let streamRequestId = '';
    try {
      const input = aiChatStreamSchema.parse(args ?? {});
      streamRequestId = input.requestId;
      const config = resolveChatConfig(input.modelId);
      if (!config) {
        return { ok: false, error: { code: 'AI_TAG_NO_DEFAULT_CONFIG', message: '没有可用的 AI 模型配置' } };
      }
      const missing = assertConfigUsable(config);
      if (missing.length > 0) {
        return {
          ok: false,
          error: { code: 'AI_TAG_CONFIG_INCOMPLETE', message: `缺少字段: ${missing.join(', ')}` },
        };
      }
      if (config.providerType !== PROVIDER_OPENAI_COMPATIBLE) {
        return { ok: false, error: { code: 'AI_MODEL_UNSUPPORTED_PROVIDER', message: '暂只支持 openai-compatible' } };
      }

      const headers = parseJsonField(config.headersJson);
      const extraConfig = parseJsonField(config.extraConfigJson);
      const url = `${String(config.baseUrl || '').replace(/\/$/, '')}/chat/completions`;
      const previous = AI_STREAMS.get(input.requestId);
      if (previous) {
        previous.stopped = true;
        previous.controller.abort();
      }
      stream = {
        controller: new AbortController(),
        content: '',
        finishReason: null,
        model: String(config.model || 'unknown'),
        usage: null,
        stopped: false,
      };
      AI_STREAMS.set(input.requestId, stream);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${decryptKey(config.apiKeyEncrypted, config.apiKeyEncryptedVersion)}`,
          ...headers,
        },
        signal: stream.controller.signal,
        body: JSON.stringify({
          model: config.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 1024,
          ...extraConfig,
          stream: true,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return { ok: false, error: { code: 'AI_CHAT_HTTP_ERROR', message: errorText || `HTTP ${response.status}` } };
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('AI response has no readable stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let sawDone = false;

      const consume = (data: string): boolean => {
        if (data === '[DONE]') {
          sawDone = true;
          return false;
        }
        let payload: {
          choices?: Array<{ delta?: unknown; finish_reason?: string }>;
          model?: string;
          usage?: unknown;
        };
        try {
          payload = JSON.parse(data) as typeof payload;
        } catch {
          return true;
        }
        const choice = payload.choices?.[0];
        const delta = extractDeltaText(choice?.delta);
        if (delta) {
          stream!.content += delta;
          broadcastAiChunk(input.requestId, delta);
        }
        stream!.finishReason = choice?.finish_reason ?? stream!.finishReason;
        stream!.model = String(payload.model || stream!.model);
        stream!.usage = payload.usage ?? stream!.usage;
        return !sawDone;
      };

      while (!sawDone) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        const drained = drainSseDataLines(buffer);
        buffer = drained.rest;
        for (const data of drained.lines) {
          if (!consume(data)) {
            break;
          }
        }
      }

      // 最后一行可能没有换行；补一个再冲一次，防止丢尾包。
      if (!sawDone && buffer.trim()) {
        const drained = drainSseDataLines(`${buffer}\n`);
        for (const data of drained.lines) {
          if (!consume(data)) {
            break;
          }
        }
      }

      // 有些兼容服务忽略 stream:true，直接回整段 JSON；补一次兜底解析。
      if (!stream.content && !sawDone) {
        try {
          const payload = JSON.parse(buffer.trim()) as {
            choices?: Array<{ message?: unknown; finish_reason?: string }>;
            model?: string;
            usage?: unknown;
          };
          const choice = payload.choices?.[0];
          stream.content = extractMessageText(choice?.message);
          stream.finishReason = choice?.finish_reason ?? stream.finishReason;
          stream.model = String(payload.model || stream.model);
          stream.usage = payload.usage ?? stream.usage;
        } catch {
          // 不是 JSON 就按空回复处理，错误留给上层展示。
        }
      }

      // abort 有时会让 reader 正常收尾，不抛 AbortError；这里也要把 stopped 带回去。
      return ok({
        content: stream.content,
        finishReason: stream.stopped ? (stream.finishReason ?? 'stopped') : stream.finishReason,
        truncated: !stream.stopped && stream.finishReason === 'length',
        model: stream.model,
        usage: stream.usage,
        stopped: stream.stopped || undefined,
      });
    } catch (error) {
      if (stream?.stopped) {
        return ok({
          content: stream.content,
          finishReason: stream.finishReason ?? 'stopped',
          truncated: false,
          model: stream.model,
          usage: stream.usage,
          stopped: true,
        });
      }
      return failFromError(error, 'AI_CHAT_STREAM_ERROR');
    } finally {
      if (stream && AI_STREAMS.get(streamRequestId) === stream) {
        AI_STREAMS.delete(streamRequestId);
      }
    }
  }

  /** 停止流式生成：只 abort 当前 requestId 对应的 fetch，返回是否真找到在跑的流。 */
  async chatCancel(args?: unknown): Promise<IpcResult<{ cancelled: boolean }>> {
    try {
      const input = aiChatCancelSchema.parse(args ?? {});
      const stream = AI_STREAMS.get(input.requestId);
      if (!stream) {
        return ok({ cancelled: false });
      }
      stream.stopped = true;
      stream.controller.abort();
      return ok({ cancelled: true });
    } catch (error) {
      return failFromError(error, 'AI_CHAT_CANCEL_ERROR');
    }
  }

  async skills(): Promise<IpcResult<ReturnType<typeof aiSkillsRepository.list>>> {
    try {
      return ok(aiSkillsRepository.list());
    } catch (error) {
      return failFromError(error, 'AI_SKILLS_ERROR');
    }
  }

  async saveSkill(args?: unknown): Promise<IpcResult<ReturnType<typeof aiSkillsRepository.list>[number]>> {
    try {
      const input = aiSkillSaveSchema.parse(args ?? {});
      return ok(aiSkillsRepository.save(input));
    } catch (error) {
      const rawCode = toErrorMessage(error);
      const code = [
        'AI_SKILL_REQUIRED_FIELDS',
        'AI_SKILL_DUPLICATE_NAME',
        'AI_SKILL_NOT_FOUND',
        'AI_SKILL_BUILTIN_READONLY',
      ].includes(rawCode)
        ? rawCode
        : 'AI_SKILL_SAVE_ERROR';
      return failFromError(error, code);
    }
  }

  async removeSkill(args?: unknown): Promise<IpcResult<boolean>> {
    try {
      const { id } = aiIdSchema.parse(args ?? {});
      return ok(aiSkillsRepository.remove(id));
    } catch (error) {
      return failFromError(error, 'AI_SKILL_REMOVE_ERROR');
    }
  }
}

AiController.toString = () => '[class AiController]';

export default AiController;
