<template>
  <el-dialog
    v-model="visible"
    width="680px"
    top="5vh"
    class="echo-instance-dialog"
    append-to-body
    destroy-on-close
  >
    <template #header>
      <div class="echo-instance-heading">
        <el-icon class="echo-instance-heading__icon"><Histogram /></el-icon>
        <span>{{ echo?.name || token?.echoName || t('echoInstance.title') }}</span>
      </div>
    </template>
    <div class="echo-instance-summary">
      <div class="echo-instance-heading">
        <span class="echo-instance-name">{{ echo?.name || token?.echoName || t('echoInstance.unnamed') }}</span>
        <el-tag v-if="echo?.renderType" size="small" effect="plain">{{ echo.renderType }}</el-tag>
      </div>
      <div v-if="echo?.desc" class="echo-instance-desc">{{ echo.desc }}</div>
      <div class="echo-instance-meta">
        {{ t('echoInstance.id') }}: <code>{{ token?.echoId || '-' }}</code>
      </div>
    </div>

    <el-form label-width="104px" class="echo-instance-form" @submit.prevent>
      <template v-if="fields.length">
        <el-form-item v-for="field in fields" :key="field.field" :label="field.title">
          <el-select
            v-if="field.type === 'select'"
            v-model="form[field.field]"
            class="echo-field-control"
          >
            <el-option
              v-for="option in field.options || []"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-switch
            v-else-if="field.type === 'switch'"
            v-model="form[field.field]"
          />
          <el-input-number
            v-else-if="field.type === 'input-number'"
            v-model="form[field.field]"
            :min="numberProp(field, 'min')"
            :max="numberProp(field, 'max')"
            :step="numberProp(field, 'step')"
          />
          <el-input
            v-else
            v-model="form[field.field]"
            :placeholder="stringProp(field, 'placeholder')"
          />
          <div v-if="field.info" class="echo-field-help">{{ field.info }}</div>
        </el-form-item>
      </template>

      <el-form-item v-else :label="t('echoInstance.value')">
        <el-input
          v-model="form.value"
          type="textarea"
          :rows="5"
          :placeholder="t('echoInstance.valuePlaceholder')"
        />
      </el-form-item>

      <div v-if="inferredFields.length" class="echo-instance-subtitle">
        {{ t('echoInstance.inferred') }}
      </div>
      <el-form-item
        v-for="field in inferredFields"
        :key="`inferred-${field.field}`"
        :label="field.title"
      >
        <el-switch v-if="field.type === 'switch'" v-model="form[field.field]" />
        <el-input-number v-else-if="field.type === 'input-number'" v-model="form[field.field]" />
        <el-input v-else v-model="form[field.field]" />
      </el-form-item>
    </el-form>

    <div class="echo-instance-help">{{ t('echoInstance.help') }}</div>

    <template #footer>
      <div class="echo-instance-footer">
        <el-button text @click="openDefinition">{{ t('echoInstance.editDefinition') }}</el-button>
        <div class="echo-instance-footer__actions">
          <el-button @click="visible = false">{{ t('action.cancel') }}</el-button>
          <el-button type="primary" @click="submit">{{ t('action.confirm') }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Histogram } from '@element-plus/icons-vue';
import type { EchoCard } from '@shared/types/domain';
import { resolveEchoSchema, type EchoSchemaField } from '@/utils/echoSchema';
import type { EchoInstancePatch, EchoInstanceToken } from '@/utils/echoToken';

const props = defineProps<{
  token: EchoInstanceToken | null;
  echo: EchoCard | null;
}>();

const emit = defineEmits<{
  (event: 'save', patch: EchoInstancePatch): void;
  (event: 'open-definition', token: EchoInstanceToken): void;
}>();

const visible = defineModel<boolean>({ default: false });
const { t } = useI18n();

const RESERVED_PROPS = new Set(['id', 'echoId', 'definitionId', 'value', 'inheritFromPrevious', 'type']);
const form = reactive<Record<string, unknown>>({});

const fields = computed(() =>
  resolveEchoSchema(props.echo)
    .filter((field) => Boolean(field.field) && !field.hidden && !RESERVED_PROPS.has(field.field))
    .map((field) => ({ ...field, title: field.title || field.field })),
);

const declaredFields = computed(() => new Set(fields.value.map((field) => field.field)));

const inferredFields = computed<Array<EchoSchemaField & { field: string }>>(() =>
  Object.keys(form)
    .filter((key) => !RESERVED_PROPS.has(key) && !declaredFields.value.has(key))
    .map((key) => {
      const value = form[key];
      return {
        field: key,
        title: key,
        type: typeof value === 'boolean' ? 'switch' : typeof value === 'number' ? 'input-number' : 'input',
      };
    }),
);

function numberProp(field: EchoSchemaField, key: string): number | undefined {
  const value = field.props?.[key];
  return typeof value === 'number' ? value : undefined;
}

function stringProp(field: EchoSchemaField, key: string): string | undefined {
  const value = field.props?.[key];
  return typeof value === 'string' ? value : undefined;
}

function resetDraft(): void {
  Object.keys(form).forEach((key) => {
    delete form[key];
  });
  const token = props.token;
  if (!token) {
    form.value = '';
    return;
  }

  Object.assign(form, token.props);
  form.value = form.value === undefined ? token.prompt : form.value;
  form.echoId = token.echoId;
  form.definitionId = props.echo?.id || token.definitionId;
  for (const field of fields.value) {
    if (form[field.field] === undefined && field.defaultValue !== undefined) {
      form[field.field] = field.defaultValue;
    }
  }
}

watch(
  () => props.token,
  () => {
    if (visible.value) {
      resetDraft();
    }
  },
  { immediate: true },
);

watch(visible, (open) => {
  if (open) {
    resetDraft();
  }
});

function submit(): void {
  const token = props.token;
  if (!token) {
    return;
  }
  const patch: EchoInstancePatch = {
    echoId: token.echoId,
    nodeId: token.nodeId,
    echoName: token.echoName,
    definitionId: props.echo?.id || token.definitionId,
    props: {
      ...form,
      value: form.value === undefined ? '' : String(form.value),
      echoId: token.echoId,
      id: token.echoId,
      definitionId: props.echo?.id || token.definitionId,
      inheritFromPrevious: false,
    },
  };
  emit('save', patch);
  visible.value = false;
}

function openDefinition(): void {
  if (props.token) {
    emit('open-definition', props.token);
    visible.value = false;
  }
}
</script>

<style>
.echo-instance-dialog {
  width: 680px !important;
  max-width: 88vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
}

.echo-instance-dialog .el-dialog__header {
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--coolma-border, #ebeef5);
}

.echo-instance-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 14px 16px;
  overflow-y: auto;
}

.echo-instance-dialog .el-dialog__footer {
  padding: 10px 16px;
  border-top: 1px solid var(--coolma-border, #ebeef5);
}
</style>

<style scoped>
.echo-instance-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--coolma-text, #303133);
  font-size: 16px;
  font-weight: 700;
}

.echo-instance-heading__icon {
  color: var(--themeColor, #409eff);
  font-size: 22px;
}

.echo-instance-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.echo-instance-footer__actions {
  display: flex;
  gap: 8px;
}

.echo-instance-summary {
  margin-bottom: 18px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 28%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.echo-instance-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.echo-instance-name {
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 600;
}

.echo-instance-desc {
  margin-top: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.55;
}

.echo-instance-meta {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.echo-instance-meta code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-family: Consolas, Monaco, monospace;
}

.echo-instance-form {
  margin-bottom: 4px;
}

.echo-instance-subtitle {
  margin: 6px 0 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-style: italic;
}

.echo-field-control {
  width: 100%;
}

.echo-field-help {
  width: 100%;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.echo-instance-help {
  padding-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.echo-instance-help code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-family: Consolas, Monaco, monospace;
}
</style>
