<template>
  <main class="editor-pane">
    <template v-if="summary">
      <div class="editor-meta">
        <div class="editor-meta-left">
          <el-tag type="success" effect="plain" size="small">Muya</el-tag>
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
        v-model="contentProxy"
        :theme="theme"
        :plugins="plugins"
        :options="editorOptions"
        class="muya-editor"
      />
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
import { Delete } from '@element-plus/icons-vue';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppInfo } from '@shared/ipc/contract';
import type { AppTheme } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import { MuyaEditor } from 'libs-muya-v3';
import { formatNoteDate, noteTags } from '@/utils/note';
import { createQuickInsertProvider } from '@/editor/quickInsert';
import { quickInsertTypes } from '@/editor/insertHandlers';
import { useLibraryStore } from '@/stores/library';
import { useNotesStore } from '@/stores/notes';

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

const libraryStore = useLibraryStore();
const notesStore = useNotesStore();

/**
 * @ 快捷面板的数据源：符文与回响。
 * provider 每次打开都读 store 里的内存缓存，不在按键路径上发 IPC。
 */
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
};

onMounted(() => {
  void libraryStore.load();
});
</script>
