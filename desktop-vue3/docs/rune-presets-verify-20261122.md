# 内置符文模板选择器复核（R-08）

日期：2026-11-22
结论：**原清单把 R-08 列为缺口是误判，功能已经存在且可用，本轮只补验收记录，不改业务代码。**

## 1. 入口

`设置 → 符文与回响 → 符文 → 新增`，对话框标题“新增符文”，模板内容工具栏右侧有“选择模板（可选）”下拉。

## 2. 实际数据

下拉分两组，共 14 项，与 `desktop-vue2/src/components/rune/runeTemplates` 的 14 个模板一一对应：

- 通用 9：空白模板、inheritFromPrevious 演示、输入框、hel-micro、JsxGraph、萤火虫、el-input、el-select、el-date-picker
- 简历 5：简历-基本信息、简历-标题段落、简历-时间段经历、简历-自由文本、简历-技能标签

DOM 实测：`.el-select-group__title` 为“通用 / 简历”，模板项 14 个；前 18 项是分类和图标下拉，不计入模板。

## 3. 选中行为

选中“简历-标题段落”后：

- 名称从空 → `简历-标题段落`；
- 描述从空 → `段落标题（H1/H2/H3），独立 rune 卡片`；
- 分类从 `通用` → `简历`；
- 源码从默认 inheritFromPrevious 模板 → `RuneResumeTitleSection` 的 SFC，Monaco 首行 `<template>`，含 `rune-rt__bar` 和 `level` 计算属性；
- 下拉显示选中项，右侧“重置”可回到默认模板。

截图：`docs/rune-presets-20261122.png`。

## 4. 结论

R-08 关闭。之前把它写进待办，是因为只看了“已保存符文列表为空”，没有继续检查表单内的 preset 下拉；当前源码 `LibraryFormDialog.vue` 已接 `runeTemplateBuiltins()`、分组和 `applyPreset()`。
