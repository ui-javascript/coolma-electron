<template>
  <el-dialog
    v-model="visible"
    width="440px"
    top="10vh"
    append-to-body
    :show-close="false"
    class="note-import-dialog"
  >
    <div class="note-import-uploader">
      <div class="note-import-toolbar">
        <span class="note-import-label">{{ t('notes.importRestricted') }}</span>
        <button type="button" class="note-import-add" @click="pickFiles">{{ t('notes.importAddFiles') }}</button>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".md,.markdown,text/markdown"
        hidden
        @change="onPick"
      />
      </div>

      <div
        class="note-import-drop"
        :class="{ dragging }"
        @click="pickFiles"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <el-icon class="note-import-drop-icon"><UploadFilled /></el-icon>
        <div class="note-import-drop-text">{{ t('notes.importPick') }}</div>
      </div>

      <div v-if="files.length > 0" class="note-import-list">
        <div v-for="(file, index) in files" :key="`${file.name}-${index}`" class="note-import-item">
          <el-icon class="note-import-item-icon"><Document /></el-icon>
          <span class="note-import-item-name">{{ file.name }}</span>
          <span class="note-import-item-size">{{ formatSize(file.size) }}</span>
          <button type="button" class="note-import-remove" :title="t('action.delete')" @click="removeAt(index)">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>
      <div v-else class="note-import-empty">{{ t('notes.importEmpty') }}</div>

      <div v-if="message" class="note-import-message">{{ message }}</div>
    </div>

    <template #footer>
      <div class="note-import-actions">
        <el-button text class="note-import-cancel" @click="visible = false">{{ t('action.cancel') }}</el-button>
        <el-button
          text
          class="note-import-submit"
          :loading="busy"
          @click="submit"
        >
          {{ t('notes.importUpload') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 单篇 Markdown 批量导入（复刻 vue2 import/ImportDialog：只接 .md，多选，逐篇建笔记）。
 * 视觉按 q-uploader flat 卡片：工具栏 + 拖拽区 + 文件列表 + 右下两个 flat 动作。
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Close, Document, UploadFilled } from '@element-plus/icons-vue';
import { useNotesStore } from '@/stores/notes';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ category?: string }>();
const { t } = useI18n();
const notesStore = useNotesStore();

const fileInput = ref<HTMLInputElement | null>(null);
const files = ref<File[]>([]);
const busy = ref(false);
const message = ref('');
const dragging = ref(false);

function pickFiles(): void {
  fileInput.value?.click();
}

function accepts(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function addFiles(list: FileList | File[] | null): void {
  if (!list) {
    return;
  }
  const incoming = Array.from(list);
  const valid = incoming.filter((file) => accepts(file.name));
  if (valid.length < incoming.length) {
    ElMessage.warning(t('notes.importOnlyMarkdown'));
  }
  valid.forEach((file) => {
    if (!files.value.some((item) => item.name === file.name && item.size === file.size)) {
      files.value.push(file);
    }
  });
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  addFiles(input.files);
  input.value = '';
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  addFiles(event.dataTransfer?.files ?? null);
}

function removeAt(index: number): void {
  files.value.splice(index, 1);
}

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function titleFromName(name: string): string {
  return name.replace(/\.(md|markdown)$/i, '') || t('notes.untitled');
}

async function submit(): Promise<void> {
  if (files.value.length === 0) {
    return;
  }
  busy.value = true;
  let imported = 0;
  const failed: string[] = [];
  for (const file of files.value) {
    try {
      const content = await file.text();
      const created = await notesStore.create({ title: titleFromName(file.name), content, category: props.category });
      if (created) {
        imported += 1;
      } else {
        failed.push(file.name);
      }
    } catch {
      failed.push(file.name);
    }
  }
  busy.value = false;
  message.value = failed.length > 0
    ? t('notes.importPartial', { imported, failed: failed.join(', ') })
    : t('notes.importDone', { imported });
  if (failed.length === 0) {
    ElMessage.success(message.value);
    files.value = [];
    visible.value = false;
  }
}
</script>

<style scoped>
.note-import-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.note-import-label {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.note-import-add {
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 12px;
  cursor: pointer;
}

.note-import-add:hover {
  background: var(--el-color-primary-light-9);
}

.note-import-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 12px;
  padding: 18px 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}

.note-import-drop:hover,
.note-import-drop.dragging {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.note-import-drop-icon {
  color: var(--el-text-color-secondary);
  font-size: 32px;
}

.note-import-drop-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.note-import-list {
  max-height: 160px;
  margin: 0 12px 12px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.note-import-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.note-import-item:last-child {
  border-bottom: 0;
}

.note-import-item-icon {
  flex: none;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.note-import-item-name {
  flex: 1;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-import-item-size {
  flex: none;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.note-import-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.note-import-remove:hover {
  background: var(--el-fill-color);
  color: var(--el-color-danger);
}

.note-import-empty {
  margin: 0 12px 12px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  text-align: center;
}

.note-import-message {
  margin: 0 12px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.note-import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.note-import-cancel,
.note-import-submit {
  color: var(--el-color-primary);
}
</style>
