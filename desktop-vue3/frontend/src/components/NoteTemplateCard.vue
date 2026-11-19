<template>
  <div class="template-block">
    <div class="template-toolbar">
      <span class="template-hint">{{ t('noteTemplateDragTip') }}</span>
      <el-button text size="small" @click="openForm(null)">
        <el-icon><Plus /></el-icon>
        <span>{{ t('noteTemplateAdd') }}</span>
      </el-button>
    </div>

    <div v-if="templates.length" class="template-grid">
      <div
        v-for="tpl in templates"
        :key="tpl.id"
        class="template-card"
        :class="{ builtin: tpl.isBuiltin }"
        @click="openForm(tpl)"
      >
        <div class="template-card-head">
          <el-icon class="template-icon">
            <Star v-if="tpl.isBuiltin" />
            <Document v-else />
          </el-icon>
          <span class="template-name">{{ tpl.name }}</span>
          <el-tag v-if="tpl.isBuiltin" size="small" type="warning" effect="plain">{{ t('noteTemplateBuiltinBadge') }}</el-tag>
          <el-button
            text
            size="small"
            class="template-delete"
            @click.stop="removeTemplate(tpl)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <div v-if="tpl.desc" class="template-desc">{{ tpl.desc }}</div>
        <div class="template-preview">{{ tpl.content || t('noteTemplateEmpty') }}</div>
      </div>
    </div>
    <p v-else class="template-empty">{{ t('noteTemplateEmpty') }}</p>

    <NoteTemplateFormDialog v-model="formVisible" :value="editing" @submit="submit" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Delete, Document, Plus, Star } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useNotesStore } from '@/stores/notes';
import type { NoteTemplate, NoteTemplateInput } from '@/services/ipc';
import NoteTemplateFormDialog from './NoteTemplateFormDialog.vue';

/** 笔记模板卡片网格（复刻 vue2 SettingsNoteTemplatePanel 的卡片布局与编辑删除交互）。 */

const { t } = useI18n();
const notesStore = useNotesStore();

const formVisible = ref(false);
const editing = ref<NoteTemplate | null>(null);

const templates = computed(() => notesStore.templates);

onMounted(() => {
  void notesStore.loadTemplates();
});

function openForm(tpl: NoteTemplate | null): void {
  editing.value = tpl;
  formVisible.value = true;
}

async function submit(input: NoteTemplateInput): Promise<void> {
  const saved = await notesStore.saveTemplate(input);
  if (saved) {
    formVisible.value = false;
    ElMessage.success(t('noteTemplateSaved'));
  }
}

async function removeTemplate(tpl: NoteTemplate): Promise<void> {
  try {
    await ElMessageBox.confirm(t('noteTemplateDeleteConfirm', { name: tpl.name }), t('noteTemplateDelete'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  if (await notesStore.removeTemplate(tpl.id)) {
    ElMessage.success(t('noteTemplateDeleted'));
  }
}
</script>

<style scoped>
.template-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.template-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}

.template-card {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  transition: box-shadow 0.12s ease;
}

.template-card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.template-card.builtin {
  background: rgba(255, 193, 7, 0.05);
}

.template-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.template-name {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-icon {
  color: var(--el-color-primary);
}

.template-delete {
  margin-left: auto;
}

.template-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.template-preview {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.template-empty {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 24px 0;
}
</style>
