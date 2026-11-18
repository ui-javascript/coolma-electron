---
name: frontend-design
description: 前端界面设计与体验优化技能。用于设计、审查或改进 Vue/Quasar/Element-UI 等前端页面、弹框、表单、卡片、列表、状态反馈、空状态、响应式布局、视觉层级和交互细节。遇到 UI 美化、前端设计、交互优化、视觉优化、卡片布局、按钮布局、表单体验、状态提示、加载/错误/空状态、响应式适配等需求时应自动使用。
---

# Frontend Design Skill

## 使用场景

当任务涉及以下内容时使用本技能：

- 页面、弹框、抽屉、卡片、列表、表单等 UI 设计或重构
- 视觉层级、间距、对齐、颜色、字体、图标、阴影、圆角等细节优化
- 加载态、空状态、错误态、成功态、禁用态、悬停态等状态设计
- 交互流程、操作按钮、危险操作确认、快捷入口、反馈提示优化
- Vue2、Quasar、Element-UI、Element-UI-X 组件组合与样式调整
- 桌面端 Electron 应用中的紧凑布局、响应式与可用性优化

## 设计原则

### 1. 信息层级优先

界面应先保证用户能快速理解：

1. 当前区域是什么
2. 主要内容是什么
3. 当前状态是否正常
4. 下一步可以做什么

常用层级：

- 标题：`text-subtitle2` / `text-body1 text-weight-medium`
- 主要内容：`text-body2`
- 辅助说明：`text-caption text-grey-6`
- 状态：`q-badge`、颜色文本、图标
- 操作：主操作用实色按钮，次操作用 flat/outline

### 2. 卡片设计

卡片适合承载独立实体，例如模型配置、同步账号、符文/回响项。

推荐结构：

```vue
<q-card flat bordered class='entity-card'>
  <q-card-section class='q-pa-sm'>
    <div class='row items-start no-wrap q-col-gutter-sm'>
      <div class='col'>
        <div class='row items-center no-wrap q-gutter-xs'>
          <div class='text-body2 text-weight-medium'>名称</div>
          <q-badge outline color='primary'>状态</q-badge>
        </div>
        <div class='text-caption text-grey-6 q-mt-xs'>辅助信息</div>
      </div>
      <div class='column q-gutter-xs'>
        <q-btn dense flat no-caps size='sm' label='操作' />
      </div>
    </div>
  </q-card-section>
</q-card>
```

卡片规则：

- 一个卡片只表达一个对象
- 状态尽量显示在对象标题附近，而不是拆到独立区域
- 操作按钮放在右侧或底部，避免打断内容阅读
- 状态详情放在主要信息下面，用 `text-caption`
- 错误/警告信息尽量贴近触发对象

### 3. 表单设计

表单应该降低输入失败概率：

- 使用清晰 label，不依赖 placeholder 承担说明
- 对密钥、URL、模型名等字段保存前统一 `trim()`
- 必填错误应该指出缺失字段
- 编辑密钥时，留空应明确表示“保留已保存值”
- 危险选项如“清空 API Key”必须有显眼的颜色和说明
- 保存失败应尽量展示具体原因，而不是统一“保存失败”

### 4. 状态反馈

每个异步操作至少考虑：

- `loading`：按钮 loading 或局部 spinner
- `success`：成功通知或卡片内成功状态
- `error`：失败通知 + 对应对象内错误信息
- `disabled`：不满足操作条件时禁用并保持原因可见

推荐：

- 短期反馈：`this.$q.notify`
- 对象级结果：直接显示在对应卡片/行内
- 全局错误：区域顶部或当前 section 下方

### 5. 按钮设计

按钮层级：

- 主操作：`unelevated color='primary'`
- 次操作：`flat` 或 `outline`
- 成功动作：`color='positive'`
- 警告/危险动作：`color='warning'` / `color='negative'`
- 工具动作：`dense flat size='sm'`

同一组按钮应保持：

- 顺序稳定
- 文案简短
- 图标语义清晰
- 禁用状态明确

### 6. 弹框设计

弹框适合聚焦单个任务。

推荐结构：

- 顶部 toolbar/header：标题 + 关闭按钮
- 中间 body：可滚动内容，分 section
- 底部 actions：取消 + 主操作

注意：

- 不要让弹框宽度过大
- 多配置项使用左侧 tabs 或 section 分组
- 保存/删除等操作应提供即时反馈
- 持久弹框 `persistent` 只在必要时使用

### 7. 颜色语义

- `primary`：当前主操作、默认状态
- `positive`：成功、可用、已完成
- `warning`：配置不完整、需要注意
- `negative`：错误、删除、危险动作
- `grey-6/7`：辅助信息
- 业务色可用于分组，但不要影响状态语义

### 8. 紧凑桌面端布局

Memocast 是桌面端笔记应用，设置弹框、列表与卡片应偏紧凑：

- 优先使用 `dense`、`options-dense`
- 卡片 section 常用 `q-pa-sm`
- 文案说明用 `text-caption`
- 操作按钮可用 `size='sm'`
- 避免大面积空白和过高卡片

## 实施检查清单

修改前端 UI 后，应检查：

- 状态是否贴近对应对象展示
- 主次操作是否清晰
- 加载/成功/失败/禁用是否都有处理
- 文案是否能解释用户为什么不能操作或为什么失败
- 是否影响暗色/亮色主题可读性
- 是否复用了项目现有 Quasar class 和 i18n 文案
- 是否避免新增过度复杂 CSS

## Memocast 项目建议

- 设置弹框内的配置项尽量使用卡片内联状态，不新增脱离对象的状态卡片
- AI 模型、同步状态、符文/回响都应优先采用“对象卡片 + 行内状态 + 右侧操作”模式
- 对云同步、AI 配置等失败率较高的功能，错误提示必须贴近具体对象
- 对密钥、URL、模型名、账号等外部服务配置，保存前必须规范化输入
- 新增文案需要同步维护 `src/i18n/zh-cn` 与 `src/i18n/en-us`
