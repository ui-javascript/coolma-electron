import Portkey from 'portkey-ai'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import DatabaseClient from 'src/utils/DatabaseClient'

const AI_MODEL_PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible'
const AI_MODEL_PROVIDER_PORTKEY = 'portkey'

const DEFAULT_COMPLETION_MAX_TOKENS = 4096

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function getProviderLabel(providerType) {
  if (providerType === AI_MODEL_PROVIDER_PORTKEY) {
    return 'Portkey'
  }

  return 'OpenAI-compatible'
}

function toPortkeyClientConfig(modelConfig) {
  if (!modelConfig || modelConfig.provider_type !== AI_MODEL_PROVIDER_PORTKEY) {
    return null
  }

  return {
    apiKey: modelConfig.api_key || '',
    virtualKey: modelConfig.virtual_key || undefined,
    baseURL: modelConfig.base_url || undefined,
    defaultHeaders: parseJsonField(modelConfig.headers_json)
  }
}

function resolveEffectiveMaxTokens(modelConfig, overrides) {
  const extraConfig = parseJsonField(modelConfig.extra_config_json)
  return (
    overrides.max_tokens ||
    overrides.max_completion_tokens ||
    extraConfig.max_tokens ||
    extraConfig.max_completion_tokens ||
    (modelConfig.max_tokens ? parseInt(modelConfig.max_tokens, 10) : null) ||
    null
  )
}

function buildRequestBody(modelConfig, messages, overrides = {}) {
  const extraConfig = parseJsonField(modelConfig.extra_config_json)
  const body = {
    messages,
    model: overrides.model || modelConfig.model,
    ...extraConfig,
    ...overrides
  }

  delete body.baseURL
  delete body.defaultHeaders
  delete body.apiKey
  delete body.virtualKey
  delete body.headers

  return body
}

function toOpenAiCompatibleRequest(modelConfig, messages, overrides = {}) {
  const extraConfig = parseJsonField(modelConfig.extra_config_json)
  const headers = parseJsonField(modelConfig.headers_json)
  const body = buildRequestBody(modelConfig, messages, overrides)

  return {
    url: `${String(modelConfig.base_url || '').replace(/\/$/, '')}/chat/completions`,
    body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.api_key || ''}`,
      ...headers,
      ...(overrides.headers || {})
    }
  }
}

async function runOpenAiCompatibleChat(modelConfig, messages, overrides = {}) {
  if (!modelConfig || modelConfig.provider_type !== AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
    return null
  }

  if (!modelConfig.api_key || !modelConfig.base_url) {
    return null
  }

  const { url, body, headers } = toOpenAiCompatibleRequest(modelConfig, messages, overrides)
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return await response.json()
}

function extractFinishReason(response) {
  return response?.choices?.[0]?.finish_reason || null
}

function isTruncatedByTokenLimit(finishReason) {
  return finishReason === 'length'
}

function extractUsage(response) {
  const usage = response?.usage
  if (!usage) return null
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens
  }
}

function extractDeltaFromSSEData(data) {
  if (!data || !data.choices || !data.choices.length) return null
  const delta = data.choices[0]?.delta
  return delta?.content || null
}

async function runOpenAiCompatibleStream(modelConfig, messages, handlers, overrides = {}) {
  if (!modelConfig || modelConfig.provider_type !== AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
    if (handlers.onError) {
      handlers.onError(new Error('Unsupported provider type for streaming'))
    }
    return
  }

  if (!modelConfig.api_key || !modelConfig.base_url) {
    if (handlers.onError) {
      handlers.onError(new Error('Incomplete OpenAI-compatible model config'))
    }
    return
  }

  const { url, body, headers } = toOpenAiCompatibleRequest(modelConfig, messages, {
    ...overrides,
    stream: true
  })

  let finishReason = null
  let truncated = false

  try {
    await fetchEventSource(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: handlers.signal || overrides.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Stream request failed with status ${response.status}`)
        }
      },
      onmessage(event) {
        if (!event || !event.data) return
        if (event.data === '[DONE]') return

        let parsed
        try {
          parsed = JSON.parse(event.data)
        } catch {
          return
        }

        if (!finishReason && parsed?.choices?.length) {
          finishReason = parsed.choices[0]?.finish_reason || null
          if (isTruncatedByTokenLimit(finishReason)) {
            truncated = true
          }
        }

        const delta = extractDeltaFromSSEData(parsed)
        if (delta && handlers.onToken) {
          handlers.onToken(delta)
        }
      },
      onclose() {
        if (handlers.onComplete) {
          handlers.onComplete({ finishReason, truncated })
        }
      },
      onerror(error) {
        if (handlers.onError) {
          handlers.onError(error)
          return
        }
        throw error
      }
    })
  } catch (err) {
    if (handlers.onError) {
      handlers.onError(err)
    } else {
      throw err
    }
  }
}

const PortkeyService = {
  async getDefaultConfig () {
    const configs = await DatabaseClient.aiModels.getAll()
    const defaultConfig = configs.find(item => item.is_default)

    if (!defaultConfig) {
      return null
    }

    return await DatabaseClient.aiModels.getById(defaultConfig.id)
  },

  async createClient (modelConfig = null) {
    const resolvedConfig = modelConfig || await this.getDefaultConfig()
    const clientConfig = toPortkeyClientConfig(resolvedConfig)

    if (!clientConfig || !clientConfig.apiKey || !clientConfig.virtualKey) {
      return null
    }

    return new Portkey(clientConfig)
  },

  getMissingFields (modelConfig) {
    if (!modelConfig) {
      return ['provider_type', 'base_url', 'model', 'api_key']
    }

    const missingFields = []
    const providerType = String(modelConfig.provider_type || '').trim()
    const hasApiKey = Boolean(modelConfig.api_key || modelConfig.hasApiKey)
    const hasVirtualKey = Boolean(modelConfig.virtual_key || modelConfig.hasVirtualKey)

    if (!providerType) {
      missingFields.push('provider_type')
      return missingFields
    }

    if (!modelConfig.base_url) {
      missingFields.push('base_url')
    }

    if (!modelConfig.model) {
      missingFields.push('model')
    }

    if (!hasApiKey) {
      missingFields.push('api_key')
    }

    if (providerType === AI_MODEL_PROVIDER_PORTKEY && !hasVirtualKey) {
      missingFields.push('virtual_key')
    }

    return missingFields
  },

  isConfigUsable (modelConfig) {
    return this.getMissingFields(modelConfig).length === 0
  },

  getProviderLabel,

  resolveEffectiveMaxTokens,

  async testConnection (modelConfig) {
    if (!modelConfig) {
      throw new Error('AI model config is unavailable')
    }

    if (!this.isConfigUsable(modelConfig)) {
      throw new Error('AI model config is incomplete')
    }

    const messages = [
      { role: 'user', content: 'Reply with OK.' }
    ]
    const overrides = {
      max_tokens: 4,
      temperature: 0
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_PORTKEY) {
      const client = await this.createClient(modelConfig)

      if (!client) {
        throw new Error('Portkey model config is incomplete')
      }

      return await client.chat.completions.create({
        messages,
        model: modelConfig.model,
        ...parseJsonField(modelConfig.extra_config_json),
        ...overrides
      })
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
      const response = await runOpenAiCompatibleChat(modelConfig, messages, overrides)

      if (!response) {
        throw new Error('OpenAI-compatible model config is incomplete')
      }

      return response
    }

    throw new Error(`Unsupported AI provider type: ${modelConfig.provider_type}`)
  },

  async chat (messages, overrides = {}) {
    const modelConfig = await this.getDefaultConfig()

    if (!modelConfig) {
      throw new Error('Default AI model config is unavailable')
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_PORTKEY) {
      const client = await this.createClient(modelConfig)

      if (!client) {
        throw new Error('Default Portkey model config is incomplete')
      }

      return await client.chat.completions.create({
        messages,
        model: overrides.model || modelConfig.model,
        ...parseJsonField(modelConfig.extra_config_json),
        ...overrides
      })
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
      const response = await runOpenAiCompatibleChat(modelConfig, messages, overrides)

      if (!response) {
        throw new Error('Default OpenAI-compatible model config is incomplete')
      }

      return response
    }

    throw new Error(`Unsupported AI provider type: ${modelConfig.provider_type}`)
  },

  async chatStream (messages, handlers = {}, overrides = {}) {
    const modelConfig = await this.getDefaultConfig()

    if (!modelConfig) {
      if (handlers.onError) {
        handlers.onError(new Error('Default AI model config is unavailable'))
      }
      return
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_PORTKEY) {
      if (handlers.onError) {
        handlers.onError(new Error('Streaming is not yet supported for Portkey provider. Please use an OpenAI-compatible provider.'))
      }
      return
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
      await runOpenAiCompatibleStream(modelConfig, messages, handlers, overrides)
      return
    }

    if (handlers.onError) {
      handlers.onError(new Error(`Unsupported AI provider type: ${modelConfig.provider_type}`))
    }
  },

  extractFinishReason,
  isTruncatedByTokenLimit,
  extractUsage
}

export default PortkeyService
