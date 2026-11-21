import type { EchoCard } from '@shared/types/domain';

export interface EchoSchemaOption {
  value: unknown;
  label: string;
}

/** 回响实例可配置字段；字段名与 `@回响{...}()` 里的 props 一一对应。 */
export interface EchoSchemaField {
  field: string;
  type: 'input' | 'select' | 'switch' | 'input-number' | string;
  title: string;
  defaultValue?: unknown;
  props?: Record<string, unknown>;
  options?: EchoSchemaOption[];
  info?: string;
  hidden?: boolean;
}

type EchoWithSchema = EchoCard & { propsSchema?: EchoSchemaField[] };

const BUILTIN_ECHO_SCHEMA: Record<string, EchoSchemaField[]> = {
  nice: [],
  growth: [
    {
      field: 'scope', type: 'select', title: '影响范围', defaultValue: 'siblings',
      options: [
        { value: 'siblings', label: '同段落兄弟' },
        { value: 'prev-block', label: '前一块兄弟' },
        { value: 'block', label: '当前 block' },
        { value: 'document', label: '整篇文档' },
      ],
    },
    {
      field: 'trigger', type: 'select', title: '触发方式', defaultValue: 'auto',
      options: [
        { value: 'auto', label: '自动 stagger' },
        { value: 'manual', label: '手动触发' },
      ],
    },
    { field: 'target', type: 'input', title: '命中选择器', defaultValue: 'p, li, h1, h2, h3' },
  ],
  shatter: [
    {
      field: 'target', type: 'select', title: '影响范围', defaultValue: 'line',
      options: [{ value: 'line', label: '同行' }, { value: 'block', label: '当前 block' }],
    },
  ],
  skywalk: [
    {
      field: 'theme', type: 'select', title: '主题', defaultValue: 'auto',
      options: [
        { value: 'auto', label: '跟随系统' },
        { value: 'light', label: '明亮' },
        { value: 'dark', label: '暗黑' },
        { value: 'sepia', label: '护眼' },
      ],
    },
    {
      field: 'layout', type: 'select', title: '排版', defaultValue: 'enhanced',
      options: [
        { value: 'compact', label: '紧凑' },
        { value: 'enhanced', label: '舒适' },
        { value: 'luxe', label: '浓郁' },
      ],
    },
  ],
  twinbloom: [
    {
      field: 'source', type: 'select', title: '复制源', defaultValue: 'prev-sibling',
      options: [
        { value: 'prev-sibling', label: '上一个元素' },
        { value: 'prev-line', label: '上一行 block' },
        { value: 'next-line', label: '下一行 block' },
      ],
    },
    { field: 'placeholderText', type: 'input', title: '占位文本', defaultValue: '双生节点' },
  ],
  mindsteal: [
    {
      field: 'mode', type: 'select', title: '作用方式', defaultValue: 'override',
      options: [
        { value: 'override', label: '覆盖' },
        { value: 'stack', label: '叠加' },
        { value: 'disable', label: '停用' },
      ],
    },
    { field: 'targets', type: 'input', title: '目标 id（逗号分隔）', defaultValue: '' },
  ],
  lucky: [
    { field: 'action', type: 'input', title: '事件 action', defaultValue: 'ai-proofread' },
    { field: 'model', type: 'input', title: 'AI 模型', defaultValue: 'default' },
  ],
  scapegoat: [
    {
      field: 'intensity', type: 'input-number', title: '受伤强度', defaultValue: 0,
      props: { min: 0, max: 1, step: 0.1 },
    },
    { field: 'error', type: 'input', title: '错误信息', defaultValue: 'pre-injured by intensity' },
  ],
  calamity: [
    {
      field: 'scope', type: 'select', title: '影响范围', defaultValue: 'siblings',
      options: [{ value: 'siblings', label: '同行' }, { value: 'block', label: '当前 block' }],
    },
    {
      field: 'intensity', type: 'input-number', title: '染彩强度', defaultValue: 0.3,
      props: { min: 0.05, max: 0.8, step: 0.05 },
    },
  ],
  disperse: [
    {
      field: 'density', type: 'select', title: '排版密度', defaultValue: 'loose',
      options: [
        { value: 'tight', label: '紧' },
        { value: 'normal', label: '正常' },
        { value: 'loose', label: '松' },
      ],
    },
  ],
  peek: [
    { field: 'collapsed', type: 'switch', title: '默认折叠', defaultValue: false },
    {
      field: 'level', type: 'select', title: '高亮强度', defaultValue: 1,
      options: [{ value: 1, label: '轻' }, { value: 2, label: '中' }, { value: 3, label: '强' }],
    },
  ],
  ignore: [
    {
      field: 'opacity', type: 'input-number', title: '透明度', defaultValue: 0.4,
      props: { min: 0.1, max: 1, step: 0.05 },
    },
  ],
  ad: [
    {
      field: 'type', type: 'select', title: '广告形态', defaultValue: 'banner',
      options: [
        { value: 'banner', label: '横幅' },
        { value: 'inline', label: '内联' },
        { value: 'sidebar', label: '侧栏' },
      ],
    },
  ],
  diff: [
    {
      field: 'mode', type: 'select', title: '差异类型', defaultValue: 'change',
      options: [
        { value: 'add', label: '新增' },
        { value: 'remove', label: '删除' },
        { value: 'change', label: '变更' },
      ],
    },
  ],
  ref: [
    { field: 'url', type: 'input', title: '链接', defaultValue: '', props: { placeholder: 'https://...' } },
    { field: 'title', type: 'input', title: '标题', defaultValue: '' },
  ],
  todo: [
    { field: 'checked', type: 'switch', title: '已完成', defaultValue: false },
  ],
  fold: [
    {
      field: 'collapsed', type: 'switch', title: '默认折叠', defaultValue: true,
      info: '实际偏好会被 localStorage 持久化（键：echo-fold-{nodeId|field}）',
    },
  ],
};

export function resolveEchoSchema(echo: EchoCard | null): EchoSchemaField[] {
  if (!echo) {
    return [];
  }
  if (Array.isArray((echo as EchoWithSchema).propsSchema) && (echo as EchoWithSchema).propsSchema!.length) {
    return (echo as EchoWithSchema).propsSchema!;
  }
  const id = String(echo.id || '').trim();
  const baseId = id.replace(/^__builtin_/, '').replace(/__$/, '');
  return BUILTIN_ECHO_SCHEMA[id] ?? BUILTIN_ECHO_SCHEMA[baseId] ?? [];
}
