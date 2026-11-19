<template>
  <main class="editor-pane">
    <template v-if="summary">
      <div class="editor-meta">
        <div class="editor-meta-left">
          <el-tag type="success" effect="plain" size="small">{{ sourceMode ? 'Monaco' : 'Muya' }}</el-tag>
          <el-button text size="small" class="mode-toggle" @click="toggleSourceMode">
            <el-icon><Switch /></el-icon>
            <span>{{ sourceMode ? t('editor.toWysiwyg') : t('editor.toSource') }}</span>
          </el-button>
          <span class="editor-meta-title">{{ summary.title }}</span>
        </div>
        <div class="editor-meta-right">
          <span class="editor-meta-note">
            {{ noteTags(summary).join(' · ') || t('notes.untagged') }} · {{ formatNoteDate(summary, t) }}
          </span>
          <span v-if="saveHint" class="save-hint" :class="{ saving }">{{ saveHint }}</span>
          <el-button text type="danger" size="small" :title="t('action.delete')" @click="emit('delete')">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
      <MuyaEditor
        v-show="!sourceMode"
        v-model="contentProxy"
        :theme="theme"
        :plugins="plugins"
        :options="editorOptions"
        class="muya-editor"
      />
      <!-- 双编辑器：源码模式用 Monaco，同一份内容，只有激活的视图回写 -->
      <SourceEditor v-if="sourceMode" v-model="contentProxy" :theme="theme" class="source-editor-host" />
    </template>

    <el-empty v-else :description="t('editor.emptyHint')">
      <template #image>
        <div class="empty-mark">C</div>
      </template>
      <p class="empty-title">{{ t('editor.emptyTitle') }}</p>
    </el-empty>

    <footer class="statusbar">
      <span class="statusbar-left">
        <span class="status-dot" :class="statusType" />
        {{ statusLabel }}
      </span>
      <span v-if="appInfo" class="statusbar-right">
        v{{ appInfo.version }} · Electron {{ appInfo.electron }} · {{ appInfo.platform }}/{{ appInfo.arch }}
      </span>
      <span v-else class="statusbar-right">{{ statusError || t('status.unavailable') }}</span>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { Delete, Switch } from '@element-plus/icons-vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppInfo } from '@shared/ipc/contract';
import type { AppTheme } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import { MuyaEditor } from 'libs-muya-v3';
import { formatNoteDate, noteTags } from '@/utils/note';
import { createQuickInsertProvider } from '@/editor/quickInsert';
import { quickInsertTypes } from '@/editor/insertHandlers';
import { useLibraryStore } from '@/stores/library';
import { saveAttachmentImage } from '@/services/ipc';
import { useNotesStore } from '@/stores/notes';
import SourceEditor from '@/components/SourceEditor.vue';

const props = defineProps<{
  summary: NoteSummary | null;
  content: string;
  theme: AppTheme;
  // Muya 插件实例由上层注入，这里只透传，不做类型约束。
  plugins: any;
  saveHint: string;
  saving: boolean;
  statusLabel: string;
  statusType: string;
  statusError: string;
  appInfo: AppInfo | null;
}>();

const emit = defineEmits<{
  (event: 'update:content', value: string): void;
  (event: 'delete'): void;
}>();

const { t } = useI18n();

const contentProxy = computed({
  get: () => props.content,
  set: (value: string) => emit('update:content', value),
});

const sourceMode = ref(false);

/** 双编辑器切换：不销毁 Muya（v-show），避免来回切换丢撤销栈与滚动位置。 */
function toggleSourceMode(): void {
  sourceMode.value = !sourceMode.value;
}

const libraryStore = useLibraryStore();
const notesStore = useNotesStore();

/**
 * @ 快捷面板的数据源：符文与回响。
 * provider 每次打开都读 store 里的内存缓存，不在按键路径上发 IPC。
 */
const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const extOfFile = (file: File): string => {
  const fromName = file.name?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) {
    return `.${fromName.toLowerCase()}`;
  }
  const fromType = file.type?.split('/')[1];
  return fromType ? `.${fromType.toLowerCase()}` : '.png';
};

/**
 * 粘贴/拖入图片 → 落盘到本地附件目录 → 返回 coolma:// 地址写进 markdown。
 * 对齐 vue2 的 save-temp-image + resource-loader 那套路径约定。
 */
async function savePastedImage(file: File): Promise<string> {
  const summary = props.summary;
  if (!summary) {
    return '';
  }
  const base64 = await readFileAsBase64(file);
  const result = await saveAttachmentImage({
    base64,
    ext: extOfFile(file),
    kbGuid: summary.kbGuid,
    docGuid: summary.docGuid,
    noteId: summary.id,
  });
  if (result.ok === false) {
    return '';
  }
  return result.data.url;
}

const editorOptions = {
  quickInsertProvider: createQuickInsertProvider(
    () => ({
      runes: libraryStore.runes,
      echoes: libraryStore.echoes,
      notes: notesStore.notes,
    }),
    (key: string) => t(key),
  ),
  // 领域插入语义由 app 注入，引擎只负责定位 @ 和调用这里。
  quickInsertTypes,
  // 图片落盘：引擎把 File 交过来，应用侧存盘并回写 coolma:// 地址
  imageAction: async (file: File | string) => {
    if (typeof File !== 'undefined' && file instanceof File) {
      return savePastedImage(file);
    }
    return '';
  },
};

onMounted(() => {
  void libraryStore.load();
});
</script>
