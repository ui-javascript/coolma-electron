// ============================================================================
// tests/unit/ai/ai-tag-service.test.js
//
// 锁定 AiTagService 的对外契约（AI 打标复用既有 AI 能力）：
//   1) 默认模型不可用 / 配置不完整 / 笔记为空 → 抛出可识别的错误码，UI 才能给可操作提示
//   2) 正常路径：把笔记标题 + 压缩后的正文 + 「已有标签」一起塞进 prompt，
//      并把模型输出解析成规范化标签名数组
//   3) prompt 里必须明确要求复用已有标签（"能复用就优先复用…名称必须完全一致"）
//
// 这里 mock 掉 PortkeyService / DatabaseClient（真实模块依赖 electron + ESM 依赖），
// 只验证本服务自己的 prompt 组织与结果解析。
// ============================================================================

jest.mock('src/utils/DatabaseClient', () => ({ __esModule: true, default: {} }))

jest.mock('src/services/PortkeyService', () => {
  const state = {
    config: null,
    usable: true,
    missingFields: [],
    response: null
  }
  return {
    __esModule: true,
    default: {
      getDefaultConfig: jest.fn(async () => state.config),
      isConfigUsable: jest.fn(() => state.usable),
      getMissingFields: jest.fn(() => state.missingFields),
      chat: jest.fn(async () => state.response),
      extractUsage: jest.fn(() => null),
      extractFinishReason: jest.fn(response => {
        const choice = response && response.choices && response.choices[0]
        return (choice && choice.finish_reason) || null
      }),
      isTruncatedByTokenLimit: jest.fn(reason => reason === 'length'),
      __state: state
    }
  }
})

const AiTagService = require('../../../src/services/AiTagService.js').default
const PortkeyService = require('src/services/PortkeyService.js').default

const { __state: portkeyState } = PortkeyService

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

beforeEach(() => {
  portkeyState.config = {
    provider_type: 'openai-compatible',
    base_url: 'https://example.com/v1',
    model: 'test-model',
    api_key: 'sk-test'
  }
  portkeyState.usable = true
  portkeyState.missingFields = []
  portkeyState.response = {
    model: 'test-model',
    choices: [{ message: { content: '["读书笔记","效率工具"]' } }]
  }
  PortkeyService.chat.mockReset()
  PortkeyService.chat.mockImplementation(async () => portkeyState.response)
  PortkeyService.getDefaultConfig.mockClear()
})

describe('AiTagService — 错误路径', () => {
  test('没有默认模型 → AI_TAG_NO_DEFAULT_CONFIG', async () => {
    portkeyState.config = null
    await expect(AiTagService.suggestTags({ title: '标题', content: '正文' }))
      .rejects.toMatchObject({ code: 'AI_TAG_NO_DEFAULT_CONFIG' })
    expect(PortkeyService.chat).not.toHaveBeenCalled()
  })

  test('模型配置不完整 → AI_TAG_CONFIG_INCOMPLETE（带 missingFields）', async () => {
    portkeyState.usable = false
    portkeyState.missingFields = ['api_key']
    await expect(AiTagService.suggestTags({ title: '标题', content: '正文' }))
      .rejects.toMatchObject({ code: 'AI_TAG_CONFIG_INCOMPLETE', missingFields: ['api_key'] })
    expect(PortkeyService.chat).not.toHaveBeenCalled()
  })

  test('笔记既无标题也无正文 → AI_TAG_EMPTY_INPUT', async () => {
    await expect(AiTagService.suggestTags({ title: '  ', content: '   ' }))
      .rejects.toMatchObject({ code: 'AI_TAG_EMPTY_INPUT' })
    expect(PortkeyService.chat).not.toHaveBeenCalled()
  })
})

describe('AiTagService — 正常路径与 prompt 组织', () => {
  test('返回规范化后的标签名', async () => {
    const result = await AiTagService.suggestTags({
      title: '读书笔记整理',
      content: '# 标题\n正文内容',
      existingTagNames: ['读书'],
      maxTags: 2
    })
    expect(result.names).toEqual(['读书笔记', '效率工具'])
    expect(result.raw).toContain('读书笔记')
    expect(result.model).toBe('test-model')
  })

  test('prompt 同时包含已有标签、标题、正文与数量约束', async () => {
    await AiTagService.suggestTags({
      title: '每周复盘',
      content: '本周完成了 A 和 B，下周计划 C。',
      existingTagNames: ['复盘', '效率工具'],
      maxTags: 3
    })

    const messages = PortkeyService.chat.mock.calls[0][0]
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')

    const userPrompt = messages[1].content
    expect(userPrompt).toContain('复盘')
    expect(userPrompt).toContain('效率工具')
    expect(userPrompt).toContain('每周复盘')
    expect(userPrompt).toContain('本周完成了 A 和 B')
    expect(userPrompt).toContain('1-3 个标签')
    expect(userPrompt).toContain('复用')
    // 复用要求必须写死在 prompt 里，否则模型容易另造同义标签
    expect(userPrompt).toContain('名称必须与下面完全一致')
  })

  test('已有标签为空时给出「暂无已有标签」占位', async () => {
    await AiTagService.suggestTags({ title: '标题', content: '正文', existingTagNames: [] })
    const userPrompt = PortkeyService.chat.mock.calls[0][0][1].content
    expect(userPrompt).toContain('暂无已有标签')
  })

  test('正文里的图片 / 代码块不会进 prompt', async () => {
    const content = '![img](https://example.com/a.png)\n```js\nconst a = 1\n```\n真正的正文'
    await AiTagService.suggestTags({ title: '标题', content })
    const userPrompt = PortkeyService.chat.mock.calls[0][0][1].content
    expect(userPrompt).toContain('真正的正文')
    expect(userPrompt).not.toContain('example.com')
    expect(userPrompt).not.toContain('const a = 1')
  })

  test('调用参数带上 temperature / max_tokens，可覆盖模型', async () => {
    await AiTagService.suggestTags({ title: '标题', content: '正文', model: 'other-model' })
    const [, overrides] = PortkeyService.chat.mock.calls[0]
    expect(overrides.model).toBe('other-model')
    expect(typeof overrides.temperature).toBe('number')
    expect(overrides.max_tokens).toBeGreaterThan(0)
  })

  test('默认输出预算要留够推理型模型的 reasoning 空间', async () => {
    // deepseek-v4-pro 这类模型把 reasoning 也算进 completion_tokens，
    // 预算太小会出现 finish_reason=length + content 为空的情况。
    await AiTagService.suggestTags({ title: '标题', content: '正文' })
    expect(PortkeyService.chat.mock.calls[0][1].max_tokens).toBeGreaterThanOrEqual(1024)
  })

  test('模型返回非 JSON 的逐行文本也能解析', async () => {
    portkeyState.response = { choices: [{ message: { content: '- 产品设计\n- 用户研究\n' } }] }
    const result = await AiTagService.suggestTags({ title: '标题', content: '正文' })
    expect(result.names).toEqual(['产品设计', '用户研究'])
  })

  test('模型返回空内容 → names 为空数组（由 UI 提示无结果）', async () => {
    portkeyState.response = { choices: [{ message: { content: '' } }] }
    const result = await AiTagService.suggestTags({ title: '标题', content: '正文' })
    expect(result.names).toEqual([])
    expect(result.truncated).toBe(false)
  })

  test('内容被 max_tokens 截断（length + 空 content）→ 放大预算重试一次', async () => {
    PortkeyService.chat
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'length', message: { content: '' } }] })
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '["读书笔记"]' } }] })

    const result = await AiTagService.suggestTags({ title: '标题', content: '正文' })

    expect(PortkeyService.chat).toHaveBeenCalledTimes(2)
    const firstBudget = PortkeyService.chat.mock.calls[0][1].max_tokens
    const retryBudget = PortkeyService.chat.mock.calls[1][1].max_tokens
    expect(retryBudget).toBeGreaterThanOrEqual(firstBudget * 2)
    expect(result.names).toEqual(['读书笔记'])
    expect(result.truncated).toBe(false)
    expect(result.finishReason).toBe('stop')
  })

  test('重试后仍被截断 → names 为空且 truncated=true（UI 提示调低标签数）', async () => {
    PortkeyService.chat.mockResolvedValue({
      choices: [{ finish_reason: 'length', message: { content: '' } }]
    })

    const result = await AiTagService.suggestTags({ title: '标题', content: '正文' })

    expect(PortkeyService.chat).toHaveBeenCalledTimes(2)
    expect(result.names).toEqual([])
    expect(result.truncated).toBe(true)
  })
})

describe('AiTagService — 默认模型状态', () => {
  test('有默认模型且可用', async () => {
    const status = await AiTagService.getDefaultModelStatus()
    expect(status.usable).toBe(true)
    expect(status.model).toBe('test-model')
  })

  test('没有默认模型时 usable=false 且不抛错', async () => {
    portkeyState.config = null
    const status = await AiTagService.getDefaultModelStatus()
    expect(status.usable).toBe(false)
    expect(status.model).toBe('')
  })
})
