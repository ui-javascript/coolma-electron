/**
 * Vue 2 SFC 编译服务（逐条复刻 vue2 vueSfcCompilerService.js）。
 *
 * 消费方是内置 `vue2-sfc-playground` 微应用：它通过 wujie bus 发
 * `microapp:parse:request`，前端桥转到 `controller/microapp/parse`，最终在这里编译。
 * 输出形状必须保持 vue2 playground 认识的 { template, script, style, customBlocks }。
 */
import { compileScript, compileStyle, compileTemplate, parse } from '@vue/compiler-sfc';

const DEFAULT_FILENAME = 'example.vue';
const DEFAULT_SCOPE_ID = 'v-scope-xxx';

interface CompilerResult {
  errors?: unknown[] | null;
}

interface VueSfcOptions {
  filename?: string;
  scopeId?: string;
}

/** 与 vue2 assertCompilerResult 同码：VUE_SFC_PARSE_FAILED / TEMPLATE / STYLE。 */
function assertCompilerResult(result: CompilerResult | undefined, stage: string): void {
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  if (!errors.length) {
    return;
  }
  const message = errors
    .map((error) => {
      if (typeof error === 'string') {
        return error;
      }
      const item = error as { message?: string };
      return item?.message || String(error);
    })
    .join('\n');
  const compilerError = Object.assign(new Error(message || `${stage} failed`), {
    code: `VUE_SFC_${stage.toUpperCase()}_FAILED`,
  });
  throw compilerError;
}

/** 编译结果里可能含 Babel AST 的循环引用，vue2 也是 JSON 往返一次再回渲染层。 */
function toSerializable<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export interface VueSfcCompileResult {
  template: string;
  script: unknown;
  style: string;
  customBlocks: unknown;
}

export async function parseVueSfc(source: unknown, options: VueSfcOptions = {}): Promise<VueSfcCompileResult> {
  if (typeof source !== 'string') {
    throw Object.assign(new TypeError('Vue SFC source must be a string'), {
      code: 'VUE_SFC_SOURCE_REQUIRED',
    });
  }

  const filename = String(options.filename || DEFAULT_FILENAME);
  const scopeId = String(options.scopeId || DEFAULT_SCOPE_ID);
  const parsedContent = parse({ source, filename });
  assertCompilerResult(parsedContent, 'parse');

  if (!parsedContent.template) {
    throw Object.assign(new Error('Vue SFC must contain a <template> block'), {
      code: 'VUE_SFC_TEMPLATE_REQUIRED',
    });
  }

  const templateResult = compileTemplate({
    filename,
    source: parsedContent.template.content,
    preprocessLang: parsedContent.template.lang,
  });
  assertCompilerResult(templateResult, 'template');

  const scriptResult = compileScript(parsedContent);
  const styleBlock = parsedContent.styles[0];
  let styleCode = '';

  if (styleBlock) {
    const styleResult = compileStyle({
      id: scopeId,
      filename,
      source: styleBlock.content,
      map: styleBlock.map,
      scoped: styleBlock.scoped,
      preprocessLang: styleBlock.lang,
    });
    assertCompilerResult(styleResult, 'style');
    styleCode = styleResult.code;
  }

  return {
    template: templateResult.code,
    script: toSerializable(scriptResult),
    style: styleCode,
    customBlocks: toSerializable(parsedContent.customBlocks),
  };
}
