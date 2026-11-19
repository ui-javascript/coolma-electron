<template>
  <div class="ai-skills">
    <div class="ai-toolbar">
      <el-button text size="small" @click="openForm(null)">
        <el-icon><Plus /></el-icon>
        <span>{{ t('aiSkillAdd') }}</span>
      </el-button>
    </div>

    <div v-if="skills.length" class="ai-skill-list">
      <div v-for="item in skills" :key="item.id" class="ai-skill-row">
        <div class="ai-skill-main">
          <span class="ai-skill-name">{{ item.title || item.name }}</span>
          <span class="ai-skill-meta">{{ item.name }}</span>
        </div>
        <div class="ai-skill-actions" @click.stop>
          <el-button text size="small" @click="openForm(item)">{{ t('aiModelEdit') }}</el-button>
          <el-button text size="small" type="danger" @click="remove(item)">{{ t('aiSkillDelete') }}</el-button>
        </div>
      </div>
    </div>
    <p v-else class="ai-empty">{{ t('aiSkillEmpty') }}</p>

    <el-dialog v-model="formVisible" :title="editing ? t('aiSkillEdit') : t('aiSkillAdd')" width="560px">
      <el-form label-width="90px" label-position="left">
        <el-form-item :label="t('aiSkillName')">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('aiSkillTitle')">
          <el-input v-model="form.title" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('aiSkillContent')">
          <el-input v-model="form.content" type="textarea" :rows="10" class="mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('action.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('action.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  listAiSkills,
  saveAiSkill,
  removeAiSkill,
  type AiSkill,
  type AiSkillSaveInput,
} from '@/services/ipc';

/** AI 技能卡（复刻 vue2 SettingsAiPanel 的 skill 子 Tab，内置技能不在此列表）。 */
const { t } = useI18n();

const skills = ref<AiSkill[]>([]);
const formVisible = ref(false);
const editing = ref<AiSkill | null>(null);
const saving = ref(false);

const form = ref<AiSkillSaveInput>({ name: '', title: '', content: '' });

onMounted(refresh);

async function refresh(): Promise<void> {
  const result = await listAiSkills();
  if (result.ok) {
    skills.value = result.data;
  }
}

function openForm(item: AiSkill | null): void {
  editing.value = item;
  form.value = item
    ? { id: item.id, name: item.name, title: item.title, content: item.content }
    : { name: '', title: '', content: '' };
  formVisible.value = true;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const result = await saveAiSkill(form.value);
    if (!result.ok) {
      ElMessage.error(result.error.message);
      return;
    }
    formVisible.value = false;
    await refresh();
    ElMessage.success(t('aiSkillSaved'));
  } finally {
    saving.value = false;
  }
}

async function remove(item: AiSkill): Promise<void> {
  try {
    await ElMessageBox.confirm(t('aiSkillDeleteConfirm', { name: item.name }), t('aiSkillDelete'), { type: 'warning' });
  } catch {
    return;
  }
  const result = await removeAiSkill(item.id);
  if (result.ok) {
    await refresh();
    ElMessage.success(t('aiSkillDeleted'));
  }
}
</script>

<style scoped>
.ai-toolbar {
  display: flex;
  justify-content: flex-end;
}

.ai-skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ai-skill-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ai-skill-name {
  font-weight: 600;
}

.ai-skill-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ai-skill-actions {
  flex-shrink: 0;
}

.ai-empty {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 20px 0;
}

.mono :deep(textarea) {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
