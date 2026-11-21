/**
 * AiTagService —— AI 打标服务
 *
 * 复用项目既有 AI 能力（PortkeyService → DatabaseClient.aiModels 的默认模型配置），
 * 只额外负责「笔记 → 标签名」这一步的 prompt 组织与结果解析，
 * 与 AiProofreadService 的分工完全一致：
 *   - 本服务不写库、不建标签；只返回规范化后的标签名数组；
 *   - 落库（复用 / 新建 / 关联笔记）交给 TagService + 调用方。
 *
 * 错误码（便于 UI 给出可操作提示）：
 *   AI_TAG_NO_DEFAULT_CONFIG   没有任何默认模型配置
 *   AI_TAG_CONFIG_INCOMPLETE   默认模型配置缺字段（带 missingFields）
 *   AI_TAG_EMPTY_INPUT         笔记没有可分析的正文 / 标题
 */

import PortkeyService from 'src/services/PortkeyService'
import {
  parseTagNames,
  condenseNoteContent,
  DEFAULT_SUGGESTED_TAGS
} from 'src/utils/tagUtil'

// 单次 prompt 的正文上限（字符）：打标只需要主题信息，不需要整篇笔记
const CONTENT_PROMPT_LIMIT = 1200
// 参与 prompt 的已有标签名数量上限，避免超长列表把 prompt 撑爆
const EXISTING_TAG_PROMPT_LIMIT = 120
// 输出预算：推理型模型（deepseek-v4-pro 等）的 reasoning 也吃 completion 预算，
// 实测单次 reasoning 在 400~1200 token 之间（预算越大它想得越久）。
// 1024 覆盖绝大多数情况，命中截断时再放大预算重试一次。
const DEFAULT_MAX_TOKENS = 1024
// 命中「空内容 + 被截断」时的重试预算
const RETRY_MAX_TOKENS = 2048

const SYSTEM_PROMPT = `你是一名严谨的笔记标签整理助手。
- 只输出一个 JSON 字符串数组，不要输出解释、不要 markdown 代码块、不要前后缀。
- 标签是简短的名词短语（2-8 个汉字，或 1-3 个英文单词）。
- 优先复用用户「已有标签」里语义相同的名称，名称必须与列表完全一致。
- 不要输出 # 前缀、不要标点、不要句子、不要重复标签。`

function buildUserPrompt ({ title, content, existingTagNames = [], maxTags = DEFAULT_SUGGESTED_TAGS }) {
  const names = (existingTagNames || [])
    .map(name => String(name || '').trim())
    .filter(Boolean)
    .slice(0, EXISTING_TAG_PROMPT_LIMIT)
  const existingBlock = names.length
    ? names.map(name => `- ${name}`).join('\n')
    : '（暂无已有标签）'
  const body = condenseNoteContent(content, CONTENT_PROMPT_LIMIT)

  return `请阅读下面的笔记，为它生成 1-${maxTags} 个标签。

【已有标签】（能复用就优先复用，输出的名称必须与下面完全一致）
${existingBlock}

【笔记标题】
${String(title || '').trim() || '（无标题）'}

【笔记正文】（可能被截断）
${body || '（无正文）'}

【输出要求】
- 只输出 JSON 字符串数组，例如 ["读书笔记","效率工具"]。
- 最多 ${maxTags} 个，按重要性排序。
- 已有标签能覆盖语义时必须复用，不要另造同义新标签。`
}

function buildMessages (params) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(params) }
  ]
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

function buildTagError (code, message, extra = {}) {
  const error = new Error(message || code)
  error.code = code
  Object.assign(error, extra)
  return error
}

const AiTagService = {
  /**
   * 读取默认模型状态，供设置面板展示「能否开始打标」。
   * @returns {Promise<{ config: object|null, usable: boolean, model: string, name: string, missingFields: string[] }>}
   */
  async getDefaultModelStatus () {
    let config = null
    try {
      config = await PortkeyService.getDefaultConfig()
    } catch (err) {
      console.warn('[AiTagService] getDefaultModelStatus failed', err)
      config = null
    }
    const usable = Boolean(config) && PortkeyService.isConfigUsable(config)
    return {
      config,
      usable,
      model: String((config && config.model) || ''),
      name: String((config && config.name) || ''),
      missingFields: config ? PortkeyService.getMissingFields(config) : []
    }
  },

  buildUserPrompt,

  buildMessages,

  parseTagNames,

  /**
   * 为单篇笔记生成标签名。
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.content
   * @param {string[]} [options.existingTagNames] 可选复用的已有标签名
   * @param {number} [options.maxTags]
   * @param {string} [options.model] 覆盖默认模型
   * @param {number} [options.temperature]
   * @param {number} [options.maxTokens] 覆盖默认输出预算
   * @returns {Promise<{ names: string[], raw: string, finishReason: string|null, truncated: boolean, model: string, usage: object|null }>}
   */
  async suggestTags ({
    title = '',
    content = '',
    existingTagNames = [],
    maxTags = DEFAULT_SUGGESTED_TAGS,
    model,
    temperature = 0.2,
    maxTokens
  } = {}) {
    const condensed = condenseNoteContent(content, CONTENT_PROMPT_LIMIT)
    if (!String(title || '').trim() && !condensed) {
      throw buildTagError('AI_TAG_EMPTY_INPUT', 'Nothing to tag: note is empty.')
    }

    const status = await this.getDefaultModelStatus()
    if (!status.config) {
      throw buildTagError('AI_TAG_NO_DEFAULT_CONFIG', 'Default AI model config is unavailable.')
    }
    if (!status.usable) {
      throw buildTagError('AI_TAG_CONFIG_INCOMPLETE', 'Default AI model config is incomplete.', {
        missingFields: status.missingFields
      })
    }

    const messages = buildMessages({ title, content, existingTagNames, maxTags })
    const requestMaxTokens = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0
      ? Number(maxTokens)
      : DEFAULT_MAX_TOKENS

    const callOnce = async (budget) => {
      const response = await PortkeyService.chat(messages, {
        temperature,
        max_tokens: budget,
        ...(model ? { model } : {})
      })
      const raw = extractContentFromChatResponse(response)
      const finishReason = PortkeyService.extractFinishReason
        ? PortkeyService.extractFinishReason(response)
        : null
      const truncated = Boolean(PortkeyService.isTruncatedByTokenLimit && PortkeyService.isTruncatedByTokenLimit(finishReason))
      return { response, raw, finishReason, truncated }
    }

    let attempt = await callOnce(requestMaxTokens)
    let names = parseTagNames(attempt.raw, { maxTags })

    // 推理型模型（如 deepseek-v4-pro）会把 completion 预算全花在 reasoning_content 上：
    // finish_reason=length 且 content 为空 → 放大预算重试一次，避免整批打标全被判成「没有标签」。
    if (!names.length && !String(attempt.raw || '').trim() && attempt.truncated) {
      console.warn(`[AiTagService] empty & truncated content (max_tokens=${requestMaxTokens}), retrying with ${Math.max(requestMaxTokens * 2, RETRY_MAX_TOKENS)}`)
      attempt = await callOnce(Math.max(requestMaxTokens * 2, RETRY_MAX_TOKENS))
      names = parseTagNames(attempt.raw, { maxTags })
    }

    return {
      names,
      raw: attempt.raw,
      finishReason: attempt.finishReason,
      truncated: attempt.truncated,
      model: String((attempt.response && attempt.response.model) || status.model || 'unknown'),
      usage: PortkeyService.extractUsage ? PortkeyService.extractUsage(attempt.response) : null
    }
  }
}

export { SYSTEM_PROMPT, CONTENT_PROMPT_LIMIT, EXISTING_TAG_PROMPT_LIMIT, DEFAULT_MAX_TOKENS, RETRY_MAX_TOKENS }

export default AiTagService
