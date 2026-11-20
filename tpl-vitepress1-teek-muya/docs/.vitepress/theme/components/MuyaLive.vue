<template>
  <div class="muya-live">
    <p v-if="!editorComp" class="muya-live-loading">编辑器加载中…</p>
    <component
      :is="editorComp"
      v-else
      v-model="markdown"
      theme="light"
      :options="editorOptions"
      class="muya-live-editor"
    />
    <p class="muya-live-tip">
      输入 <code>@</code> 唤起快捷面板：符文/回响分组的数据来自
      <code>libs-rune-core</code> / <code>libs-echo-core</code> 的 pure 层，
      插入语义同源——与 desktop 端共用同一份实现。
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, shallowRef, ref, type Component } from 'vue';
// 引擎（及其依赖 dompurify 等）在模块顶层读 window，SSR 会炸。
// 文档站的原则：SSR 阶段绝不 import 引擎——onMounted 后才动态加载。
// 桌面端没有 SSR，可以直接静态 import；这个差异是文档站的，不是引擎的锅。
import { buildEchoItems, createEchoInsertHandler } from 'libs-echo-core';
import { buildRuneItems, createRuneInsertHandler } from 'libs-rune-core';

const editorComp = shallowRef<Component | null>(null);

onMounted(async () => {
  const { MuyaEditor } = await import('libs-muya-vue3');
  await import('libs-muya-vue3/style.css');
  editorComp.value = MuyaEditor as Component;
});

/**
 * 模板内的演示卡片。桌面端这两份列表来自 SQLite，
 * 文档站没有库，就固定给几张样例——构造逻辑与桌面端完全一致。
 */
const demoRunes = [
  { id: 'r-todo', name: '待办', desc: '插入一个待办勾选块', color: '#F06292' },
  { id: 'r-book', name: '书摘', desc: '书名 + 页码 + 摘录', color: '#7E57C2' },
  { id: 'r-review', name: '复盘', desc: '三行复盘模板', color: '#4CAF50' },
];

const demoEchoes = [
  { id: 'e-timer', name: '计时', desc: '当前段落计时回响', color: '#26A69A' },
  { id: 'e-vocab', name: '词汇', desc: '可编辑的生词卡', color: '#42A5F5' },
];

const markdown = ref(
  [
    '# Muya 引擎实机演示',
    '',
    '这是一块真正跑起来的 Muya 编辑器（libs-muya-vue3）。',
    '',
    '- 输入 `@` 唤起快捷面板，试试「符文」「回响」分组',
    '- 插入的符文是 SFC 卡片，回响带可编辑的值',
    '',
    '',
  ].join('\n'),
);

const editorOptions = {
  quickInsertProvider: () => ({
    sectionName: '基础',
    items: {
      符文: buildRuneItems(demoRunes, '符文'),
      回响: buildEchoItems(demoEchoes, '回响'),
    },
    echoSectionName: '回响',
  }),
  // 领域插入语义由 core 包提供，引擎只负责定位 @ 并调用——与桌面端同构
  quickInsertTypes: {
    rune: createRuneInsertHandler(),
    echo: createEchoInsertHandler(),
  },
};
</script>

<style scoped>
.muya-live {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 12px;
  background: var(--vp-c-bg);
}

.muya-live-editor {
  min-height: 320px;
}

.muya-live-tip {
  font-size: 13px;
  color: var(--vp-c-text-2);
  margin: 10px 0 0;
}
</style>
