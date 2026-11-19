<template>
  <el-dialog v-model="visible" :title="t('notes.importNotes')" width="520px" append-to-body>
    <el-alert type="info" :closable="false" show-icon :title="t('notes.importNotesHint')" />
    <el-upload
      class="note-upload"
      drag
      multiple
      accept=".md,.markdown,text/markdown"
      :auto-upload="false"
      :show-file-list="true"
      :file-list="fileList"
      :on-change="onChange"
      :on-remove="onRemove"
    >
      <el-icon class="upload-icon"><UploadFilled /></el-icon>
      <div class="upload-text">{{ t('notes.importNotesDrop') }}</div>
    </el-upload>
    <div v-if="message" class="import-message">{{ message }}</div>
    <template #footer>
      <el-button @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" :loading="busy" :disabled="files.length === 0" @click="submit">
        {{ t('notes.importStart') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 单篇 Markdown 批量导入（复刻 vue2 import/ImportDialog：只接 .md，多选，逐篇建笔记）。
 * vue3 用 el-upload 手动模式，前端读文本后走 notesStore.create。
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, type UploadFile, type UploadUserFile } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { useNotesStore } from '@/stores/notes';

const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ category?: string }>();
const { t } = useI18n();
const notesStore = useNotesStore();

const fileList = ref<UploadUserFile[]>([]);
const files = ref<File[]>([]);
const busy = ref(false);
const message = ref('');

function onChange(file: UploadFile): void {
  const raw = file.raw;
  if (raw) {
    files.value.push(raw);
    fileList.value = files.value.map((item) => ({ name: item.name, size: item.size }));
  }
}

function onRemove(file: UploadFile): void {
  files.value = files.value.filter((item) => item.name !== file.name);
  fileList.value = files.value.map((item) => ({ name: item.name, size: item.size }));
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
    fileList.value = [];
    visible.value = false;
  }
}
</script>

<style scoped>
.note-upload { margin-top: 12px; }
.upload-icon { font-size: 40px; color: var(--el-text-color-secondary); }
.upload-text { font-size: 13px; color: var(--el-text-color-secondary); margin-top: 6px; }
.import-message { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
