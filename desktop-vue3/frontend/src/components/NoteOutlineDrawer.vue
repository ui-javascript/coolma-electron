<template>
  <el-drawer v-model="visible" :title="t('outline.title')" direction="rtl" size="280px" append-to-body>
    <div v-if="nodes.length === 0" class="outline-empty">{{ t('outline.empty') }}</div>
    <el-tree
      v-else
      :data="nodes"
      node-key="key"
      :props="{ label: 'label', children: 'children' }"
      default-expand-all
      highlight-current
      class="outline-tree"
      @node-click="onNodeClick"
    />
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * 大纲抽屉（复刻 vue2 NoteOutlineDrawer）：标题树 + 点击滚动到对应块。
 * vue2 走 bus SCROLL_TO_HEADER，vue3 由父级传 markdown，纯函数建树后按序号跳。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildOutline } from '@/utils/outline';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ markdown: string }>();
const emit = defineEmits<{ (event: 'jump', index: number): void }>();

const { t } = useI18n();
const nodes = computed(() => buildOutline(props.markdown ?? ''));
const flat = computed(() => {
  const list: Array<{ key: string }> = [];
  const walk = (items: Array<{ children?: Array<unknown> }>): void => {
    items.forEach((item) => {
      list.push(item as { key: string });
      const children = (item as { children?: Array<{ children?: Array<unknown> }> }).children;
      if (children?.length) {
        walk(children);
      }
    });
  };
  walk(nodes.value as Array<{ children?: Array<unknown> }>);
  return list;
});

function onNodeClick(node: { key: string }): void {
  const index = flat.value.findIndex((item) => item.key === node.key);
  if (index >= 0) {
    emit('jump', index);
  }
}
</script>

<style scoped>
.outline-tree {
  font-size: 13px;
}

.outline-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
