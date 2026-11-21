import { echoBuiltins, runeTemplateBuiltins } from '@shared/builtins/catalog';

export type CodeGenType = 'rune' | 'echo';

const RUNE_TEMPLATE_EXAMPLE = [
  '<template>',
  '  <div class="rune-card" :style="{ borderColor: color }">',
  '    <!-- 符文内容 -->',
  '  </div>',
  '</template>',
  '',
  '<script>',
  'export default {',
  '  name: "myRune",',
  '  props: {',
  '    value: { type: String, default: "" },',
  '    color: { type: String, default: "#7E57C2" }',
  '  },',
  '  methods: {',
  '    updateValue (val) {',
  '      this.$emit("input", val)',
  '    }',
  '  }',
  '}',
  '<\\/script>',
  '',
  '<style scoped>',
  '.rune-card {',
  '  border: 2px solid;',
  '  border-radius: 8px;',
  '  padding: 12px;',
  '}',
  '</style>',
].join('\n');

/** 对齐 vue2 runeFormDialog.handleRequestAiHelp：内置模板只截前 500 字符。 */
export function buildRuneCodeGenPrompt(input: { desc: string; current: string }): string {
  const builtinTemplates = runeTemplateBuiltins().map((tpl) => (
    `【${tpl.name}】\n${tpl.desc || '无描述'}\n---\ntemplate:\n\`\`\`html\n${tpl.payload.template.substring(0, 500)}\n\`\`\``
  )).join('\n\n');

  return [
    '你是一个符文（Rune）编辑器助手。请根据用户的描述和所有内置符文模板，帮助生成一个新的符文 SFC 代码。',
    '',
    '用户描述：',
    input.desc.trim() || '（未提供描述）',
    '',
    '当前符文内容是：',
    input.current.trim() || '（空）',
    '',
    '基于此进行修改。',
    '',
    '所有内置符文模板：',
    builtinTemplates,
    '',
    '请生成一个新的符文 SFC，遵循以下格式：',
    '```html',
    RUNE_TEMPLATE_EXAMPLE,
    '```',
    '',
    '只输出最终的代码块，不要输出分析过程。',
  ].join('\n');
}

/** 对齐 vue2 echoFormDialog.handleRequestAiHelp。 */
export function buildEchoCodeGenPrompt(input: { desc: string; current: string }): string {
  const builtinTemplates = echoBuiltins().map((card) => (
    `【${card.name}】\n${card.desc || '无描述'}\n---\nanno_source:\n\`\`\`javascript\n${card.payload.annoSource}\n\`\`\`\n`
  )).join('\n\n');

  return `你是一个回响（Echo）编辑器助手。请根据用户的描述和所有内置回响模板，帮助生成一个新的回响 anno_source 代码。

用户描述：
${input.desc.trim() || '（未提供描述）'}

当前回响内容是：
${input.current.trim() || '（空）'}

基于此进行修改。

所有内置回响模板：
${builtinTemplates}

请生成一个新的回响 anno_source，遵循以下格式：
\`\`\`javascript
export default {
  type: 'echo',        // 'echo' | 'echo-chant' | 'echo-tbd'
  field: 'xxx',        // 字段名（与 name 相同）
  title: 'xxx',        // 标题
  version: 1,
  props: {},
  render(node, props = {}) {
    return '<span>...</span>'  // 返回 HTML 字符串
  },
  afterRender(node, props = {}) {
    const $ = window.jQuery
    const $node = $(node)
    // 使用 jQuery 操作 DOM
  }
}
\`\`\`

只输出最终的代码块，不要输出分析过程。`;
}

/**
 * 从 AI 回复中提取代码：优先任意常见代码围栏；
 * 没有围栏时对齐 vue2 的兜底逻辑，跳过 markdown 标题/强调/列表行。
 */
export function extractGeneratedCode(markdown: string): string {
  const source = String(markdown || '');
  const fenced = source.match(/```(?:html|vue|javascript|js|typescript|ts)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const codeLines: string[] = [];
  let inCodeBlock = false;
  for (const line of source.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || (!line.startsWith('#') && !line.startsWith('**') && !line.startsWith('-') && !line.startsWith('*'))) {
      codeLines.push(line);
    }
  }
  return codeLines.join('\n').trim();
}
