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
          <div class="ai-skill-title-row">
            <span class="ai-skill-name">{{ item.title || item.name }}</span>
            <el-tag v-if="!item.enabled" size="small" type="info">{{ t('aiSkillDisabled') }}</el-tag>
          </div>
          <span class="ai-skill-meta">{{ item.name }}</span>
        </div>
        <div class="ai-skill-actions" @click.stop>
          <el-button text size="small" @click="openForm(item)">{{ t('aiSkillEdit') }}</el-button>
          <el-button text size="small" type="danger" @click="remove(item)">{{ t('aiSkillDelete') }}</el-button>
        </div>
      </div>
    </div>
    <p v-else class="ai-empty">{{ t('aiSkillEmpty') }}</p>

    <el-dialog v-model="formVisible" :title="editing ? t('aiSkillEdit') : t('aiSkillAdd')" width="560px">
      <el-form label-width="90px" label-position="left">
        <el-form-item :label="t('aiSkillName')">
          <el-input v-model="form.name" maxlength="100" />
          <div class="ai-skill-hint">{{ t('aiSkillNameHint') }}</div>
          <div v-if="nameError" class="ai-skill-error">{{ nameError }}</div>
        </el-form-item>
        <el-form-item :label="t('aiSkillTitle')">
          <el-input v-model="form.title" maxlength="200" />
          <div class="ai-skill-hint">{{ t('aiSkillTitleHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('aiSkillContent')">
          <el-input v-model="form.content" type="textarea" :rows="10" class="mono" />
          <div class="ai-skill-hint">{{ t('aiSkillContentHint') }}</div>
          <div v-if="contentError" class="ai-skill-error">{{ contentError }}</div>
        </el-form-item>
        <el-form-item :label="t('aiSkillEnabled')">
          <el-switch v-model="form.enabled" />
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
const nameError = ref('');
const contentError = ref('');

const form = ref<AiSkillSaveInput>({ name: '', title: '', content: '', enabled: true });

onMounted(refresh);

async function refresh(): Promise<void> {
  const result = await listAiSkills();
  if (result.ok) {
    skills.value = result.data;
  }
}

function openForm(item: AiSkill | null): void {
  editing.value = item;
  nameError.value = '';
  contentError.value = '';
  form.value = item
    ? { id: item.id, name: item.name, title: item.title, content: item.content, enabled: item.enabled }
    : { name: '', title: '', content: '', enabled: true };
  formVisible.value = true;
}

function validate(): boolean {
  nameError.value = '';
  contentError.value = '';
  if (!String(form.value.name ?? '').trim()) {
    nameError.value = t('aiSkillNameRequired');
    return false;
  }
  if (!String(form.value.title ?? '').trim()) {
    ElMessage.warning(t('aiSkillTitleRequired'));
    return false;
  }
  if (!String(form.value.content ?? '').trim()) {
    contentError.value = t('aiSkillContentRequired');
    return false;
  }
  return true;
}

async function save(): Promise<void> {
  if (!validate()) {
    return;
  }
  saving.value = true;
  try {
    const result = await saveAiSkill({
      ...form.value,
      name: String(form.value.name ?? '').trim(),
      title: String(form.value.title ?? '').trim(),
    });
    if (!result.ok) {
      const code = result.error.code;
      if (code === 'AI_SKILL_DUPLICATE_NAME') {
        nameError.value = t('aiSkillNameExists');
        ElMessage.warning(t('aiSkillNameExists'));
      } else if (code === 'AI_SKILL_REQUIRED_FIELDS') {
        ElMessage.warning(t('aiSkillRequiredFields'));
      } else {
        ElMessage.error(`${t('aiSkillSaveFailed')}: ${result.error.message}`);
      }
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
  } else {
    ElMessage.error(t('aiSkillDeleteFailed'));
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

.ai-skill-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-skill-name {
  font-weight: 600;
}

.ai-skill-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ai-skill-hint {
  width: 100%;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.ai-skill-error {
  width: 100%;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-color-danger);
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
