<template>
  <el-dialog
    :model-value="modelValue"
    width="70vw"
    top="5vh"
    append-to-body
    class="move-note-dialog"
    @update:model-value="close"
  >
    <template #header>
      <div class="move-note-title">
        <el-icon class="move-note-icon"><Share /></el-icon>
        <span>{{ t('notes.moveTitle') }}</span>
      </div>
    </template>
    <div class="move-note-body">
      <el-tree
        :data="folderTree"
        node-key="key"
        :props="{ label: 'label', children: 'children' }"
        :current-node-key="current || '/'"
        default-expand-all
        highlight-current
        :expand-on-click-node="false"
        class="move-note-tree"
        @node-click="selectFolder"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Share } from '@element-plus/icons-vue';

interface FolderNode {
  key: string;
  label: string;
  children: FolderNode[];
}

const props = defineProps<{
  modelValue: boolean;
  current: string;
  folders: string[];
  pending?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'confirm', category: string): void;
}>();

const { t } = useI18n();

function normalize(path: string): string {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts.length > 0 ? `/${parts.join('/')}` : '/';
}

/** 把扁平分类路径还原成 vue2 CategoryDialog 的 q-tree 结构。 */
const folderTree = computed<FolderNode[]>(() => {
  const root: FolderNode = { key: '/', label: t('index.all'), children: [] };
  const nodes = new Map<string, FolderNode>([['/', root]]);

  const ensure = (parts: string[]): FolderNode => {
    let parent = root;
    parts.forEach((part, index) => {
      const key = `/${parts.slice(0, index + 1).join('/')}`;
      let node = nodes.get(key);
      if (!node) {
        node = { key, label: part, children: [] };
        nodes.set(key, node);
        parent.children.push(node);
      }
      parent = node;
    });
    return parent;
  };

  const allPaths = new Set(props.folders.map(normalize));
  if (props.current) {
    allPaths.add(normalize(props.current));
  }
  allPaths.forEach((path) => {
    if (path === '/') {
      return;
    }
    ensure(path.split('/').filter(Boolean));
  });

  const sortNodes = (node: FolderNode): void => {
    node.children.sort((left, right) => left.label.localeCompare(right.label));
    node.children.forEach(sortNodes);
  };
  sortNodes(root);
  return [root];
});

function close(): void {
  emit('update:modelValue', false);
}

function selectFolder(node: FolderNode): void {
  emit('confirm', normalize(node.key));
  close();
}
</script>

<style scoped>
.move-note-tree {
  padding: 8px 10px;
  background: transparent;
  color: var(--el-text-color-primary);
}

.move-note-tree :deep(.el-tree-node__content) {
  height: 30px;
  border-radius: 4px;
}

.move-note-tree :deep(.el-tree-node__content:hover) {
  background: var(--el-fill-color-light);
}

.move-note-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.move-note-tree :deep(.el-tree-node__label) {
  font-size: 13px;
}

.move-note-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.move-note-icon {
  color: var(--el-color-primary);
  font-size: 22px;
}
</style>
