---
name: settings-module-color-icon
description: Memocast Settings 模块的 theme color、icon 和功能对应关系速查指南。用于新增/修改 Settings 面板时快速查阅各模块的颜色编码和图标规范。
---

# Settings 模块 Theme Color 与 Icon 速查

## 一级导航（SettingsNav）

位于 `src/components/settings/SettingsNav.vue`，对应 Settings 左侧 Tab 导航：

| 模块 | tab name | icon (Material Icons) | color class | 主色值 |
|-----|----------|----------------------|-------------|--------|
| **通用** | `general` | `tune` | `text-red-7` | `#e53935` 红色 |
| **编辑器** | `editor` | `edit_attributes` | `text-orange-8` | `#ef6c00` 橙色 |
| **AI** | `ai` | `auto_awesome` | `text-yellow-9` | `#f9a825` 黄色 |
| **云服务** | `server` | `storage` | `text-green-7` | `#43a047` 绿色 |
| **云函数** | `cloudFn` | `cloud_circle` | `text-cyan-7` | `#00acc1` 青色 |
| **回响** | `echo` | `graphic_eq` | `text-blue-7` | `#0288d1` 蓝色 |
| **符文** | `rune` | `star` | `text-purple-7` | `#9c27b0` 紫色 |

### 图标选择依据

- **通用** → `tune`（调谐器/设置）：强调配置属性
- **编辑器** → `edit_attributes`（编辑属性）：编辑器是核心功能
- **AI** → `auto_awesome`（自动/精彩）：AI 的智能感
- **云服务** → `storage`（存储）：同步即数据存储
- **云函数** → `cloud_circle`（云圈）：云的明确标识
- **回响** → `graphic_eq`（音频均衡）：回响的声波/频率视觉隐喻
- **符文** → `star`（星星）：符文的魔法/特殊感

## 二级导航（各 Panel 内部 SubTab）

### SettingsGeneralPanel

| 模块 | subTab value | icon | accent-color |
|-----|-------------|------|--------------|
| 语言 | `language` | `language` | `red-7` |
| 主题 | `theme` | `palette` | `red-7` |
| 日志 | `log` | `description` | `red-7` |
| 数据库 | `database` | `storage` | `red-7` |
| 版本 | `version` | `info` | `red-7` |

> 注意：通用面板的二级子导航统一使用 `red-7`，与一级导航保持一致。

## 颜色编码规范

### Quasar 颜色命名规则

```
<色系>-<深浅度>
```

| 色系 | 示例 | 含义 |
|-----|------|------|
| `red` | `red-7` | 红色系（第7级亮度） |
| `orange` | `orange-8` | 橙色系 |
| `yellow` | `yellow-9` | 黄色系 |
| `green` | `green-7` | 绿色系 |
| `cyan` | `cyan-7` | 青色系 |
| `blue` | `blue-7` | 蓝色系 |
| `purple` | `purple-7` | 紫色系 |

### 亮度数字含义

| 数字 | 亮度 | 适用场景 |
|-----|------|---------|
| 1-3 | 浅色 | 背景、hover |
| 4-6 | 中等 | 主要颜色 |
| 7-9 | 深色 | 高亮、强调 |
| 10-14 | 极深 | 深色模式适配 |

### 暗色模式适配

在 `.body--dark` 下使用更亮的数值（如 `red-5` → `red-7`），示例：

```scss
// 亮色模式
background: linear-gradient(135deg, rgba(229, 57, 53, 0.15) 0%, rgba(229, 57, 53, 0.05) 100%);

// 暗色模式
.body--dark .xxx {
  background: linear-gradient(135deg, rgba(239, 83, 80, 0.25) 0%, rgba(239, 83, 80, 0.1) 100%);
}
```

## 新增模块时的规范

### 1. 添加一级导航

在 `SettingsNav.vue` 中新增 `<q-tab>`：

```vue
<q-tab
  name='新模块名'
  icon='对应的图标'
  :label="$t('i18n_key')"
  class='text-<色系>-<深浅>'
/>
```

同时在 CSS 中添加对应颜色的激活样式（包含亮/暗模式）。

### 2. 在 SettingsDialog.vue 中注册

```vue
<q-tab-panel name='新模块名' class='q-pa-none'>
  <SettingsXxxPanel ... />
</q-tab-panel>
```

### 3. 颜色选择原则

| 功能类型 | 推荐色系 | 理由 |
|---------|---------|------|
| 核心/系统功能 | `red` | 强调重要性 |
| 内容编辑类 | `orange` | 活力、创造力 |
| AI/智能类 | `yellow` | 智慧、灵感 |
| 数据/存储类 | `green` | 成功、安全感 |
| 声音/波形类 | `cyan` | 科技感 |
| 云/网络类 | `blue` | 信任、连接 |
| 魔法/特殊类 | `purple` | 神秘、高级感 |

### 4. 图标选择来源

使用 [Material Icons](https://fonts.google.com/icons)：
- 搜索关键词找到对应图标
- 图标名格式：`icon_name`（下划线连接）

## 相关文件

| 文件 | 职责 |
|-----|------|
| `src/components/settings/SettingsNav.vue` | 一级导航，定义所有模块 Tab |
| `src/components/settings/SettingsDialog.vue` | 主容器，注册各 Panel |
| `src/components/settings/SettingsGeneralPanel.vue` | 通用面板二级导航 |
| `src/components/settings/SettingsEditorPanel.vue` | 编辑器面板 |
| `src/components/settings/SettingsAiPanel.vue` | AI 面板 |
| `src/components/settings/SettingsServerPanel.vue` | 云服务面板 |
| `src/components/settings/SettingsEchoPanel.vue` | 回响面板 |
| `src/components/settings/SettingsCloudFnPanel.vue` | 云函数面板 |
| `src/components/settings/SettingsRunePanel.vue` | 符文面板 |
| `src/components/layout/Header.vue` | 顶部导航，skin 切换逻辑 |

---

# Skin 皮肤颜色系统

## 概述

Memocast 使用 CSS Variable 实现皮肤颜色系统，核心变量为 `--themeColor`。切换皮肤时动态修改这些变量值。

## 皮肤列表

| 皮肤 ID | 名称 i18n key | 主色 | RGB 值 | 通知背景色 | 通知文字色 |
|--------|-------------|------|--------|-----------|-----------|
| `baiyang` | `skin_baiyang` | `#409EFF` | `64, 158, 255` | `rgba(64, 158, 255, 0.9)` | `#fff` |
| `nezha` | `skin_nezha` | `#b5817d` | `181, 129, 125` | `rgba(181, 129, 125, 0.95)` | `#fff` |
| `infp` | `skin_infp` | `#21b56f` | `33, 181, 111` | `rgba(33, 181, 111, 0.9)` | `#fff` |

> **baiyang 是默认皮肤**，其 `applySkinThemeColor` 中 `baiyang` 对应 `null`，表示清除 CSS 变量，恢复 Element-UI 默认蓝色。

## CSS Variable 体系

皮肤颜色会生成 10 个透明度梯度的 CSS 变量：

```css
:root {
  --themeColor: rgba(rgb, 1);      /* 100% 不透明度 */
  --themeColor90: rgba(rgb, .9);   /* 90% 不透明度 */
  --themeColor80: rgba(rgb, .8);
  --themeColor70: rgba(rgb, .7);
  --themeColor60: rgba(rgb, .6);
  --themeColor50: rgba(rgb, .5);
  --themeColor40: rgba(rgb, .4);
  --themeColor30: rgba(rgb, .3);
  --themeColor20: rgba(rgb, .2);
  --themeColor10: rgba(rgb, .1);   /* 10% 不透明度 */
}
```

### 透明度梯度使用场景

| Variable | 典型用途 |
|----------|---------|
| `--themeColor` | 按钮背景、图标、选中状态 |
| `--themeColor10` | hover 背景、边框填充 |
| `--themeColor20` | box-shadow、阴影 |
| `--themeColor30` | 边框、分割线 |
| `--themeColor40` | 滤镜、模糊效果 |
| `--themeColor50` | 半透明遮罩 |
| `--themeColor90` | 通知栏背景 |

### 使用示例

```vue
<!-- 按钮背景 -->
<el-button style="background-color: var(--themeColor)">确认</el-button>

<!-- hover 效果 -->
<div style="background-color: var(--themeColor10); border: 1px solid var(--themeColor30);">
  悬浮效果
</div>

<!-- 阴影 -->
<div style="box-shadow: 0 2px 8px var(--themeColor20);">
  卡片阴影
</div>
```

## 皮肤切换逻辑

### 入口

顶部 Header 的下拉菜单（`Header.vue`）：

```vue
<el-dropdown trigger="click" @command="handleSkinCommand">
  <!-- ... -->
  <el-dropdown-item command="nezha">{{ $t('skin_nezha') }}</el-dropdown-item>
  <el-dropdown-item command="baiyang">{{ $t('skin_baiyang') }}</el-dropdown-item>
  <el-dropdown-item command="infp">{{ $t('skin_infp') }}</el-dropdown-item>
</el-dropdown>
```

### 方法链

```javascript
handleSkinCommand(command) {
  // 1. 更新 store
  this.toggleChanged({ key: 'skin', value: nextSkin })
  // 2. 应用 CSS Variable
  this.applySkinThemeColor(nextSkin)
  // 3. 切换 Header 样式类
  this.applyHeaderSkinClass(nextSkin)
  // 4. 发送通知
  this.showSkinSwitchNotification(nextSkin)
}
```

## 新增皮肤步骤

### 1. 定义颜色配置

在 `Header.vue` 的 `handleSkinCommand` 和 `applySkinThemeColor` 方法中添加：

```javascript
// handleSkinCommand 中的 skinColors
const skinColors = {
  baiyang: { bg: 'rgba(64, 158, 255, 0.9)', text: '#fff' },
  nezha: { bg: 'rgba(181, 129, 125, 0.95)', text: '#fff' },
  infp: { bg: 'rgba(33, 181, 111, 0.9)', text: '#fff' },
  新皮肤: { bg: 'rgba(r, g, b, 0.9)', text: '#fff' }  // 新增
}

// applySkinThemeColor 中的 skinColors
const skinColors = {
  baiyang: null,  // 默认，恢复默认蓝色
  nezha: { main: '#b5817d', rgb: '181, 129, 125' },
  infp: { main: '#21b56f', rgb: '33, 181, 111' },
  新皮肤: { main: '#rrggbb', rgb: 'r, g, b' }  // 新增
}
```

### 2. 添加下拉菜单项

```vue
<el-dropdown-item command="新皮肤">{{ $t('skin_新皮肤') }}</el-dropdown-item>
```

### 3. 添加 i18n 翻译

在 `src/i18n/zh-CN.js` 等语言文件中添加：

```javascript
skin_新皮肤: '新皮肤名称'
```

### 4. 添加 Header 样式（可选）

如果皮肤需要特殊的 Header 样式（如 nezha 的白色背景），在 `Header.vue` 的 `<style>` 中添加：

```scss
.header--skin-新皮肤 {
  /* 特定样式 */
}
```

## 颜色选择建议

| 风格 | 推荐色系 | RGB 示例 |
|-----|---------|---------|
| 默认/科技 | 蓝色 | `64, 158, 255` |
| 温暖/文艺 | 粉色/橙棕 | `181, 129, 125` |
| 清新/自然 | 绿色 | `33, 181, 111` |
| 活泼/年轻 | 橙色 | `255, 152, 0` |
| 神秘/高级 | 紫色 | `156, 39, 176` |

## 相关文件

| 文件 | 职责 |
|-----|------|
| `src/components/layout/Header.vue` | 皮肤切换入口、`applySkinThemeColor` 方法 |
| `src/components/category/CategoryTreePanel.vue` | 使用 `--themeColor` 样式 |
| `src/components/muya/Muya.vue` | 编辑器内使用 `--themeColor` |
| `src/pages/Index.vue` | 首页使用 `--themeColor` 样式 |
