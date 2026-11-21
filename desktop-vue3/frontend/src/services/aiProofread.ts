import { aiChat, listAiModels, type AiChatMessage } from '@/services/ipc';

/** 与 vue2 AiProofreadService 同一套提示词：只校对，不改写、不补内容。 */
export const PROOFREAD_SYSTEM_PROMPT = `你是一名严谨的中文 / 英文 Markdown 校对助手。
- 只输出**校对后**的完整 Markdown，不要解释、不要 markdown 包裹、不要前后缀说明。
- 保留所有原始结构（标题层级、列表、代码块、引用、链接、回响 @xxx{...}(...) 与符文语法）。
- 仅修正错别字、明显病句、英文拼写错误、标点错误；不做风格改写、不补充内容。
- 如果原文无错，输出与原文完全一致的内容。`;

export function buildProofreadMessages(markdown: string): AiChatMessage[] {
  return [
    { role: 'system', content: PROOFREAD_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `下面是待校对的 Markdown 原文：\n\n\`\`\`markdown\n${markdown}\n\`\`\`\n\n请直接返回校对后的 Markdown。`,
    },
  ];
}

export interface ProofreadResult {
  corrected: string;
  model: string;
  truncated: boolean;
}

export class ProofreadError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** `@强运{model: "..."}` 里的 model 是配置里的模型名，不是数据库 id；按 model/name 两列匹配。 */
async function resolveModelId(modelName: string): Promise<number | undefined> {
  if (!modelName.trim()) {
    return undefined;
  }
  const result = await listAiModels();
  if (!result.ok) {
    return undefined;
  }
  const matched = result.data.find((model) => (
    model.enabled && (model.model === modelName || model.name === modelName)
  ));
  return matched?.id;
}

export async function proofreadMarkdown(markdown: string, options: { model?: string } = {}): Promise<ProofreadResult> {
  const source = String(markdown || '');
  if (!source.trim()) {
    throw new ProofreadError('AI_PROOFREAD_EMPTY', 'Empty markdown; nothing to proofread.');
  }
  const modelId = await resolveModelId(String(options.model || ''));
  const result = await aiChat({
    ...(modelId ? { modelId } : {}),
    messages: buildProofreadMessages(source),
    temperature: 0.2,
    // 主进程默认 1024，校对整篇笔记会被截断；给足空间并在截断时拒绝写回。
    maxTokens: 4096,
  });
  if (!result.ok) {
    throw new ProofreadError(result.error.code, result.error.message);
  }
  const corrected = String(result.data.content || '').trim();
  return {
    corrected,
    model: result.data.model || 'unknown',
    truncated: result.data.truncated,
  };
}
