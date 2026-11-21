<template>
  <div class="ai-models">
    <div class="ai-toolbar">
      <el-button text size="small" @click="openForm(null)">
        <el-icon><Plus /></el-icon>
        <span>{{ t('aiModelAdd') }}</span>
      </el-button>
    </div>

    <div v-if="models.length" class="ai-model-list">
      <div v-for="item in models" :key="item.id" class="ai-model-row" :class="{ disabled: !item.enabled }">
        <div class="ai-model-main">
          <span class="ai-model-name">{{ item.name }}</span>
          <el-tag v-if="item.isDefault" size="small" type="success" effect="plain">{{ t('aiDefaultTag') }}</el-tag>
          <el-tag size="small" effect="plain">{{ item.providerType }}</el-tag>
          <span class="ai-model-meta">{{ item.model }} · {{ item.baseUrl }}</span>
          <span class="ai-model-meta">{{ t('aiApiKeyMasked', { masked: item.apiKeyMasked || '—' }) }}</span>
        </div>
        <div class="ai-model-actions" @click.stop>
          <el-button text size="small" :loading="testingId === item.id" @click="test(item)">
            {{ t('aiModelTestConnection') }}
          </el-button>
          <el-button text size="small" @click="openForm(item)">{{ t('aiModelEdit') }}</el-button>
          <el-button v-if="!item.isDefault" text size="small" type="success" @click="setDefault(item)">
            {{ t('aiSetDefault') }}
          </el-button>
          <el-button text size="small" type="danger" @click="remove(item)">{{ t('aiModelDelete') }}</el-button>
        </div>
      </div>
    </div>
    <p v-else class="ai-empty">{{ t('aiModelEmpty') }}</p>

    <el-dialog v-model="formVisible" :title="editing ? t('aiModelEdit') : t('aiModelAdd')" width="560px">
      <el-form label-width="110px" label-position="left">
        <el-form-item :label="t('aiModelConfigName')">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('aiProviderType')">
          <el-select v-model="form.providerType" class="w-full">
            <el-option label="openai-compatible" value="openai-compatible" />
            <el-option label="portkey" value="portkey" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('aiBaseUrl')">
          <el-input v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item :label="t('aiModelName')">
          <el-input v-model="form.model" placeholder="gpt-4o-mini / doubao-pro-32k" />
        </el-form-item>
        <el-form-item :label="t('aiApiKey')">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="apiKeyPlaceholder" />
          <el-checkbox v-if="editing?.hasApiKey" v-model="form.clearApiKey">{{ t('aiClearApiKey') }}</el-checkbox>
        </el-form-item>
        <el-form-item v-if="form.providerType === 'portkey'" :label="t('aiPortkeyVirtualKey')">
          <el-input v-model="form.virtualKey" type="password" show-password />
          <el-checkbox v-if="editing?.hasVirtualKey" v-model="form.clearVirtualKey">{{ t('aiClearVirtualKey') }}</el-checkbox>
        </el-form-item>
        <el-form-item label="Headers JSON">
          <el-input v-model="form.headersJson" type="textarea" :rows="2" class="mono" placeholder="{}" />
        </el-form-item>
        <el-form-item label="Extra JSON">
          <el-input v-model="form.extraConfigJson" type="textarea" :rows="2" class="mono" placeholder="{}" />
        </el-form-item>
        <el-form-item :label="t('aiSetDefault')">
          <el-switch v-model="form.isDefault" />
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
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  listAiModels,
  saveAiModel,
  removeAiModel,
  setDefaultAiModel,
  testAiModel,
  type AiModelSaveInput,
  type AiModelView,
} from '@/services/ipc';

/** AI 模型配置卡（复刻 vue2 SettingsAiPanel 的 model 子 Tab）。 */
const { t } = useI18n();

const models = ref<AiModelView[]>([]);
const formVisible = ref(false);
const editing = ref<AiModelView | null>(null);
const testingId = ref<number | null>(null);
const saving = ref(false);

const form = ref<AiModelSaveInput>({
  name: '',
  providerType: 'openai-compatible',
  baseUrl: '',
  model: '',
  apiKey: '',
  isDefault: false,
  headersJson: '{}',
  extraConfigJson: '{}',
});

const apiKeyPlaceholder = computed(() => {
  if (editing.value?.hasApiKey) {
    return t('aiApiKeySavedMasked', { masked: editing.value.apiKeyMasked });
  }
  return t('aiApiKeyOptionalOnEdit');
});

onMounted(refresh);

async function refresh(): Promise<void> {
  const result = await listAiModels();
  if (result.ok) {
    models.value = result.data;
  }
}

function openForm(item: AiModelView | null): void {
  editing.value = item;
  form.value = item
    ? {
        id: item.id,
        name: item.name,
        providerType: item.providerType,
        baseUrl: item.baseUrl,
        model: item.model,
        apiKey: '',
        clearApiKey: false,
        virtualKey: '',
        clearVirtualKey: false,
        isDefault: item.isDefault,
        headersJson: item.headersJson,
        extraConfigJson: item.extraConfigJson,
      }
    : {
        name: '',
        providerType: 'openai-compatible',
        baseUrl: '',
        model: '',
        apiKey: '',
        isDefault: false,
        headersJson: '{}',
        extraConfigJson: '{}',
      };
  formVisible.value = true;
}

function validateJson(text: string | undefined): boolean {
  if (!text || text.trim() === '') {
    return true;
  }
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function validate(): boolean {
  const name = String(form.value.name ?? '').trim();
  const baseUrl = String(form.value.baseUrl ?? '').trim();
  const model = String(form.value.model ?? '').trim();
  if (!name || !baseUrl || !model) {
    ElMessage.warning(t('aiModelRequiredFields'));
    return false;
  }
  try {
    const parsed = new URL(baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error('invalid protocol');
    }
  } catch {
    ElMessage.warning(t('aiBaseUrlInvalid'));
    return false;
  }
  if (!editing.value) {
    const apiKey = String(form.value.apiKey ?? '').trim();
    const virtualKey = String(form.value.virtualKey ?? '').trim();
    if (form.value.providerType === 'portkey') {
      if (!apiKey) {
        ElMessage.warning(t('aiPortkeyApiKeyRequired'));
        return false;
      }
      if (!virtualKey) {
        ElMessage.warning(t('aiVirtualKeyRequired'));
        return false;
      }
    } else if (!apiKey) {
      ElMessage.warning(t('aiApiKeyRequired'));
      return false;
    }
  }
  if (!validateJson(form.value.headersJson) || !validateJson(form.value.extraConfigJson)) {
    ElMessage.warning(t('aiJsonInvalid'));
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
    const result = await saveAiModel({
      ...form.value,
      name: String(form.value.name ?? '').trim(),
      baseUrl: String(form.value.baseUrl ?? '').trim(),
      model: String(form.value.model ?? '').trim(),
    });
    if (!result.ok) {
      const code = result.error.code;
      const message = code === 'AI_MODEL_DUPLICATE_NAME'
        ? t('aiConfigNameExists')
        : code === 'AI_MODEL_REQUIRED_FIELDS'
          ? t('aiModelRequiredFields')
          : code === 'AI_MODEL_SECRET_REQUIRED'
            ? (form.value.providerType === 'portkey' ? t('aiVirtualKeyRequired') : t('aiApiKeyRequired'))
            : `${t('aiConfigSaveFailed')}: ${result.error.message}`;
      if (code === 'AI_MODEL_DUPLICATE_NAME' || code === 'AI_MODEL_REQUIRED_FIELDS' || code === 'AI_MODEL_SECRET_REQUIRED') {
        ElMessage.warning(message);
      } else {
        ElMessage.error(message);
      }
      return;
    }
    formVisible.value = false;
    await refresh();
    ElMessage.success(t('aiModelSaved'));
  } finally {
    saving.value = false;
  }
}

async function test(item: AiModelView): Promise<void> {
  testingId.value = item.id;
  try {
    const result = await testAiModel(item.id);
    if (result.ok) {
      ElMessage.success(t('aiModelTestOk'));
    } else {
      ElMessage.error(`${t('aiModelTestFail')}: ${result.error.message}`);
    }
  } finally {
    testingId.value = null;
  }
}

async function setDefault(item: AiModelView): Promise<void> {
  const result = await setDefaultAiModel(item.id);
  if (!result.ok) {
    ElMessage.error(`${t('aiConfigSaveFailed')}: ${result.error.message}`);
    return;
  }
  await refresh();
  ElMessage.success(t('aiDefaultModelUpdated'));
}

async function remove(item: AiModelView): Promise<void> {
  try {
    await ElMessageBox.confirm(t('aiModelDeleteConfirm', { name: item.name }), t('aiModelDelete'), { type: 'warning' });
  } catch {
    return;
  }
  const result = await removeAiModel(item.id);
  if (!result.ok) {
    ElMessage.error(t('aiConfigDeleteFailed'));
    return;
  }
  await refresh();
  ElMessage.success(t('aiConfigDeleted'));
}
</script>

<style scoped>
.ai-toolbar {
  display: flex;
  justify-content: flex-end;
}

.ai-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ai-model-row.disabled {
  opacity: 0.55;
}

.ai-model-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.ai-model-name {
  font-weight: 600;
}

.ai-model-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ai-model-actions {
  display: flex;
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

.w-full {
  width: 100%;
}
</style>
