const {
  parse,
  compileTemplate,
  compileScript,
  compileStyle
} = require('@vue/compiler-sfc')

const DEFAULT_FILENAME = 'example.vue'
const DEFAULT_SCOPE_ID = 'v-scope-xxx'

function assertCompilerResult (result, stage) {
  const errors = Array.isArray(result && result.errors) ? result.errors : []
  if (!errors.length) return

  const message = errors
    .map(error => error && error.message ? error.message : String(error))
    .join('\n')
  const compilerError = new Error(message || `${stage} failed`)
  compilerError.code = `VUE_SFC_${stage.toUpperCase()}_FAILED`
  throw compilerError
}

function toSerializable (value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

async function parseVueSfc (source, options = {}) {
  if (typeof source !== 'string') {
    const error = new TypeError('Vue SFC source must be a string')
    error.code = 'VUE_SFC_SOURCE_REQUIRED'
    throw error
  }

  const filename = String(options.filename || DEFAULT_FILENAME)
  const scopeId = String(options.scopeId || DEFAULT_SCOPE_ID)
  const parsedContent = parse({ source, filename })
  assertCompilerResult(parsedContent, 'parse')

  if (!parsedContent.template) {
    const error = new Error('Vue SFC must contain a <template> block')
    error.code = 'VUE_SFC_TEMPLATE_REQUIRED'
    throw error
  }

  const templateResult = compileTemplate({
    filename,
    source: parsedContent.template.content,
    preprocessLang: parsedContent.template.lang
  })
  assertCompilerResult(templateResult, 'template')

  const scriptResult = compileScript(parsedContent)
  const styleBlock = parsedContent.styles[0]
  let styleCode = ''

  if (styleBlock) {
    const styleResult = compileStyle({
      id: scopeId,
      filename,
      source: styleBlock.content,
      map: styleBlock.map,
      scoped: styleBlock.scoped,
      preprocessLang: styleBlock.lang
    })
    assertCompilerResult(styleResult, 'style')
    styleCode = styleResult.code
  }

  return {
    template: templateResult.code,
    script: toSerializable(scriptResult),
    style: styleCode,
    customBlocks: toSerializable(parsedContent.customBlocks)
  }
}

module.exports = {
  parseVueSfc
}
