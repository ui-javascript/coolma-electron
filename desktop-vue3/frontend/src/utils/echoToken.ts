import { parseEchoProps } from 'libs-muya-echo-vue3';

/** 正文里的回响实例：`@名称{props}(prompt)`。 */
export interface EchoInstanceToken {
  echoId: string;
  nodeId: string;
  echoName: string;
  definitionId: string;
  props: Record<string, unknown>;
  prompt: string;
  raw: string;
}

/** 弹窗保存时回传的实例补丁；只改当前 token 的 props，不动回响定义。 */
export interface EchoInstancePatch {
  echoId: string;
  nodeId?: string;
  echoName?: string;
  definitionId?: string;
  props: Record<string, unknown>;
}

const ECHO_TOKEN_SOURCE = '@([^\\s{}()@]+)(?:\\{([\\s\\S]*?)\\})?\\(([^)]*)\\)';

function tokenPattern(): RegExp {
  return new RegExp(ECHO_TOKEN_SOURCE, 'g');
}

function asString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * 读取花括号里的 props。
 * v3 插入的是 `echoId: '...', value: '...'` 源码片段；v2 历史数据可能是一段
 * payload JSON，这里两种都兼容。
 */
export function parseEchoTokenProps(body = ''): Record<string, unknown> {
  const source = String(body || '').trim();
  if (!source) {
    return {};
  }

  if (/^".+"\s*:/.test(source) || /^version\s*:/.test(source)) {
    try {
      const parsed = JSON.parse(`{${source}}`) as { props?: Record<string, unknown> };
      if (parsed?.props && typeof parsed.props === 'object') {
        return parsed.props;
      }
    } catch {
      // 不是合法 JSON，继续按 props 源码解析。
    }
  }

  const parsed = parseEchoProps(source) as Record<string, unknown>;
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') {
    return `'${escapeString(value)}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "''";
  }
  try {
    return `'${escapeString(JSON.stringify(value))}'`;
  } catch {
    return `'${escapeString(String(value))}'`;
  }
}

function serializeProps(props: Record<string, unknown>): string {
  return Object.entries(props)
    .filter(([key, value]) => Boolean(key) && value !== undefined)
    .map(([key, value]) => `${key}: ${serializeValue(value)}`)
    .join(', ');
}

function computeNodeId(echoId: string, raw: string, start: number, end: number): string {
  return `echo-${echoId}-${start}-${end}-${raw.length}`;
}

/** 按 echoId 从 Markdown 里取当前实例；取不到可用 host dataset 兜底。 */
export function readEchoInstance(
  markdown: string,
  echoId: string,
 ): EchoInstanceToken | null {
  const target = String(echoId || '').trim();
  if (!target) {
    return null;
  }

  const regex = tokenPattern();
  for (const match of String(markdown || '').matchAll(regex)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const echoName = String(match[1] || '').trim() || '回响';
    const props = parseEchoTokenProps(match[2] || '');
    const instanceId = asString(props.echoId || props.id).trim();
    if (instanceId !== target) {
      continue;
    }
    return {
      echoId: instanceId,
      nodeId: computeNodeId(instanceId, raw, index, index + raw.length),
      echoName,
      definitionId: asString(props.definitionId).trim(),
      props,
      prompt: String(match[3] || ''),
      raw,
    };
  }
  return null;
}

/**
 * 只重写命中的实例 token，保留名称、prompt 和其它实例。
 * 返回空字符串表示没找到或没有变化。
 */
export function rewriteEchoInstance(
  markdown: string,
  echoId: string,
  props: Record<string, unknown>,
): string {
  const target = String(echoId || '').trim();
  if (!target) {
    return '';
  }

  let matched = false;
  const next = String(markdown || '').replace(tokenPattern(), (raw, name, body, prompt) => {
    if (matched) {
      return raw;
    }
    const current = parseEchoTokenProps(body || '');
    if (asString(current.echoId || current.id).trim() !== target) {
      return raw;
    }
    matched = true;
    const merged: Record<string, unknown> = {
      ...current,
      ...props,
      echoId: target,
      id: target,
      value: props.value !== undefined ? props.value : current.value,
    };
    const echoName = String(name || '').trim() || '回响';
    return `@${echoName}{${serializeProps(merged)}}(${String(prompt || '')})`;
  });

  if (!matched || next === markdown) {
    return '';
  }
  return next;
}
