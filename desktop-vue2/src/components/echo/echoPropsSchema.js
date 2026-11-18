// ============================================================================
// echoPropsSchema —— form-create rule 集合（v2026-07-28 起对齐 form-create 标准字段）
//
// 一张 echo 卡的「实例可配置参数」可以通过 propsSchema 直接挂在 echo 上，
// 每个 schema 项就是 form-create 的 rule 子集：
//   echo.propsSchema = [
//     { field: 'density', type: 'select', title: '密度', options: [...], defaultValue: 'loose' },
//     { field: 'color',   type: 'input',  title: '颜色', props: { placeholder: '#RRGGBB' } }
//   ]
//
// === echo propsSchema 是 form-create rule 的子集（v2026-07-28 起固定）===
// 只保留以下标准字段（其他 form-create 字段如 children / validate / inject / col / control
// 都直接透传，因为 buildFormCreateRule 就是 .map(item => 标准化)）：
//   rule.type      控件类型（input / select / switch / input-number / ...）
//   rule.field     表单字段名（与 echo.props 同名）
//   rule.title     label 文本
//   rule.value     运行时控件当前值（由 buildFormCreateRule 根据实例 props 填入）
//   rule.props     控件静态属性（placeholder / min / max / activeValue / inactiveValue / ...）
//   rule.on        控件事件回调（change / blur / input / ...）
//   rule.options   select / radio / checkbox 选项
//   rule.info      表单下方提示
//   rule.hidden    是否隐藏
//
// 涉及 echo 抽象的（echo 自有字段，写在 schema 项里）：
//   schemaItem.defaultValue  控件默认值（实例 props 未提供时生效）；buildFormCreateRule 会转成 rule.value
//   - 注意：echo 的 defaultValue 不等于 form-create 的 value——前者是"默认值"，后者是"当前值"
//   - 命名加 defaultValue 避免跟 form-create.value 混淆
// ============================================================================

// 16 个内置 echo 的 propsSchema（schema 项是 echo 自有的 form-create rule 子集）
export const BUILTIN_ECHO_PROPS_SCHEMA = Object.freeze({
  nice: [],
  growth: [
    { field: 'scope', type: 'select', title: '影响范围', defaultValue: 'siblings',
      options: [
        { value: 'siblings', label: '同段落兄弟' },
        { value: 'prev-block', label: '前一块兄弟' },
        { value: 'block', label: '当前 block' },
        { value: 'document', label: '整篇文档' }
      ]
    },
    { field: 'trigger', type: 'select', title: '触发方式', defaultValue: 'auto',
      options: [
        { value: 'auto', label: '自动 stagger' },
        { value: 'manual', label: '手动触发' }
      ]
    },
    { field: 'target', type: 'input', title: '命中选择器', defaultValue: 'p, li, h1, h2, h3' }
  ],
  shatter: [
    { field: 'target', type: 'select', title: '影响范围', defaultValue: 'line',
      options: [{ value: 'line', label: '同行' }, { value: 'block', label: '当前 block' }] }
  ],
  skywalk: [
    { field: 'theme', type: 'select', title: '主题', defaultValue: 'auto',
      options: [
        { value: 'auto', label: '跟随系统' },
        { value: 'light', label: '明亮' },
        { value: 'dark', label: '暗黑' },
        { value: 'sepia', label: '护眼' }
      ]
    },
    { field: 'layout', type: 'select', title: '排版', defaultValue: 'enhanced',
      options: [
        { value: 'compact', label: '紧凑' },
        { value: 'enhanced', label: '舒适' },
        { value: 'luxe', label: '浓郁' }
      ]
    }
  ],
  twinbloom: [
    { field: 'source', type: 'select', title: '复制源', defaultValue: 'prev-sibling',
      options: [
        { value: 'prev-sibling', label: '上一个元素' },
        { value: 'prev-line', label: '上一行 block' },
        { value: 'next-line', label: '下一行 block' }
      ]
    },
    { field: 'placeholderText', type: 'input', title: '占位文本', defaultValue: '双生节点' }
  ],
  mindsteal: [
    { field: 'mode', type: 'select', title: '作用方式', defaultValue: 'override',
      options: [
        { value: 'override', label: '覆盖' },
        { value: 'stack', label: '叠加' },
        { value: 'disable', label: '停用' }
      ]
    },
    { field: 'targets', type: 'input', title: '目标 id（逗号分隔）', defaultValue: '' }
  ],
  lucky: [
    { field: 'action', type: 'input', title: '事件 action', defaultValue: 'ai-proofread' },
    { field: 'model', type: 'input', title: 'AI 模型', defaultValue: 'default' }
  ],
  scapegoat: [
    { field: 'intensity', type: 'input-number', title: '受伤强度', defaultValue: 0,
      props: { min: 0, max: 1, step: 0.1 } },
    { field: 'error', type: 'input', title: '错误信息', defaultValue: 'pre-injured by intensity' }
  ],
  calamity: [
    { field: 'scope', type: 'select', title: '影响范围', defaultValue: 'siblings',
      options: [{ value: 'siblings', label: '同行' }, { value: 'block', label: '当前 block' }] },
    { field: 'intensity', type: 'input-number', title: '染彩强度', defaultValue: 0.3,
      props: { min: 0.05, max: 0.8, step: 0.05 } }
  ],
  disperse: [
    { field: 'density', type: 'select', title: '排版密度', defaultValue: 'loose',
      options: [
        { value: 'tight', label: '紧' },
        { value: 'normal', label: '正常' },
        { value: 'loose', label: '松' }
      ]
    }
  ],
  peek: [
    { field: 'collapsed', type: 'switch', title: '默认折叠', defaultValue: false },
    { field: 'level', type: 'select', title: '高亮强度', defaultValue: 1,
      options: [{ value: 1, label: '轻' }, { value: 2, label: '中' }, { value: 3, label: '强' }] }
  ],
  ignore: [
    { field: 'opacity', type: 'input-number', title: '透明度', defaultValue: 0.4,
      props: { min: 0.1, max: 1, step: 0.05 } }
  ],
  ad: [
    { field: 'type', type: 'select', title: '广告形态', defaultValue: 'banner',
      options: [
        { value: 'banner', label: '横幅' },
        { value: 'inline', label: '内联' },
        { value: 'sidebar', label: '侧栏' }
      ]
    }
  ],
  diff: [
    { field: 'mode', type: 'select', title: '差异类型', defaultValue: 'change',
      options: [
        { value: 'add', label: '新增' },
        { value: 'remove', label: '删除' },
        { value: 'change', label: '变更' }
      ]
    }
  ],
  ref: [
    { field: 'url', type: 'input', title: '链接', defaultValue: '', props: { placeholder: 'https://...' } },
    { field: 'title', type: 'input', title: '标题', defaultValue: '' }
  ],
  todo: [
    { field: 'checked', type: 'switch', title: '已完成', defaultValue: false }
  ],
  fold: [
    { field: 'collapsed', type: 'switch', title: '默认折叠', defaultValue: true,
      info: '实际偏好会被 localStorage 持久化（键：echo-fold-{nodeId|field}）' }
  ]
})

export const resolvePropsSchema = (echo = {}) => {
  if (Array.isArray(echo?.propsSchema) && echo.propsSchema.length) return echo.propsSchema
  // 既能按 echo.id 直查，也能按去前缀 `__builtin_xxx__` 后的 baseId 查
  const id = String(echo?.id || '').trim()
  const baseId = id.replace(/^__builtin_/, '').replace(/__$/, '')
  const byId = BUILTIN_ECHO_PROPS_SCHEMA[id] || BUILTIN_ECHO_PROPS_SCHEMA[baseId]
  if (Array.isArray(byId) && byId.length) return byId
  return []
}

// 把 echo propsSchema 标准化成 form-create rule 数组；
// value = 实例 props（已生效值），未提供则 fallback 到 schemaItem.defaultValue；
// props / on / options / info 直接透传；hidden 项被过滤；field/type 缺失被丢弃。
export const buildFormCreateRule = (echo = {}, props = {}) => {
  const schema = resolvePropsSchema(echo)
  if (!schema.length) return []
  return schema
    .filter(item => item && item.field && item.type && !item.hidden)
    .map(item => {
      const field = String(item.field).trim()
      const rule = {
        type: item.type,
        field,
        title: item.title || field,
        value: props[field] !== undefined ? props[field] : item.defaultValue
      }
      if (item.props) rule.props = item.props
      if (item.on && typeof item.on === 'object') rule.on = item.on
      if (item.options) rule.options = item.options
      if (item.info) rule.info = item.info
      return rule
    })
}
