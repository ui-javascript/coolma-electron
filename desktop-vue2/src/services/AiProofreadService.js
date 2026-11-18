import PortkeyService from 'src/services/PortkeyService'

const SYSTEM_PROMPT = `你是一名严谨的中文 / 英文 Markdown 校对助手。
- 只输出**校对后**的完整 Markdown，不要解释、不要 markdown 包裹、不要前后缀说明。
- 保留所有原始结构（标题层级、列表、代码块、引用、链接、回响 @xxx{...}(...) 与符文语法）。
- 仅修正错别字、明显病句、英文拼写错误、标点错误；不做风格改写、不补充内容。
- 如果原文无错，输出与原文完全一致的内容。`

const USER_PROMPT_TEMPLATE = (markdown) => `下面是待校对的 Markdown 原文：

\`\`\`markdown
${markdown}
\`\`\`

请直接返回校对后的 Markdown。`

function buildMessages (markdown) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT_TEMPLATE(markdown) }
  ]
}

const AiProofreadService = {
  /**
   * 对 markdown 做一次 AI 校对。
   * 调默认 AI provider；如果没有默认配置抛错。
   * @returns {Promise<{ corrected: string, model: string }>}
   */
  async proofread (markdown, overrides = {}) {
    const source = String(markdown || '')
    if (!source.trim()) {
      throw new Error('Empty markdown; nothing to proofread.')
    }
    const modelConfig = await PortkeyService.getDefaultConfig()
    if (!modelConfig) {
      const error = new Error('AI_PROOFREAD_NO_DEFAULT_CONFIG')
      error.code = 'AI_PROOFREAD_NO_DEFAULT_CONFIG'
      throw error
    }
    if (!PortkeyService.isConfigUsable(modelConfig)) {
      const error = new Error('AI_PROOFREAD_CONFIG_INCOMPLETE')
      error.code = 'AI_PROOFREAD_CONFIG_INCOMPLETE'
      error.missingFields = PortkeyService.getMissingFields(modelConfig)
      throw error
    }
    const messages = buildMessages(source)
    const response = await PortkeyService.chat(messages, {
      temperature: overrides.temperature || 0.2,
      ...overrides
    })
    const corrected = extractContentFromChatResponse(response) || ''
    return {
      corrected: corrected.trim(),
      model: response?.model || modelConfig.model || 'unknown',
      usage: PortkeyService.extractUsage ? PortkeyService.extractUsage(response) : null
    }
  }
}

function extractContentFromChatResponse (response) {
  if (!response) return ''
  const choice = response.choices && response.choices[0]
  if (!choice) return ''
  const message = choice.message || {}
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map(part => (typeof part === 'string' ? part : (part?.text || '')))
      .join('')
  }
  return ''
}

export default AiProofreadService