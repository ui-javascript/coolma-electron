<template>
  <el-dialog
    v-model="visible"
    :title="readonly ? t('library.viewCard') : kind === 'rune' ? t(exists ? 'library.editRune' : 'library.newRune') : t(exists ? 'library.editEcho' : 'library.newEcho')"
    :width="kind === 'rune' ? '760px' : '900px'"
    top="5vh"
    :class="['library-form-dialog', kind === 'rune' ? 'library-form-dialog--rune' : 'library-form-dialog--echo']"
    append-to-body
    destroy-on-close
  >
    <div class="library-form-body">
      <div class="library-form-content">
        <div class="library-form-fields" :class="{ 'library-form-fields--echo': kind === 'echo' }">
          <div class="library-field">
            <div class="library-field-label">{{ t('library.name') }}</div>
            <el-input
              v-model="form.name"
              :readonly="readonly"
              :placeholder="t('library.namePlaceholder')"
              maxlength="100"
              class="library-input"
            />
          </div>

          <div class="library-field library-field--desc">
            <div class="library-field-label">
              {{ t('library.desc') }}
              <el-tooltip
                v-if="!readonly"
                :content="kind === 'rune' ? t('library.aiGenerateRune') : t('library.aiGenerateEcho')"
                placement="top"
              >
                <button type="button" class="library-ai-btn" @click="requestAiHelp">
                  <el-icon><MagicStick /></el-icon>
                </button>
              </el-tooltip>
            </div>
            <el-input
              v-model="form.desc"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 5 }"
              :readonly="readonly"
              :placeholder="t('library.descPlaceholder')"
              maxlength="200"
              class="library-input"
            />
          </div>

          <div class="library-field library-field--tight">
            <div class="library-field-label">{{ t('library.category') }}</div>
            <el-select v-model="form.category" :disabled="readonly" filterable class="library-input">
              <el-option
                v-for="option in categoryOptions"
                :key="option.value"
                :label="t(option.label)"
                :value="option.value"
              />
            </el-select>
          </div>

          <div class="library-field library-field--tight">
            <div class="library-field-label">{{ t('library.icon') }}</div>
            <el-select v-model="form.icon" :disabled="readonly" filterable class="library-input">
              <el-option
                v-for="option in iconOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              >
                <span class="icon-option">
                  <el-icon v-if="libraryIconOf(option.value)"><component :is="libraryIconOf(option.value)" /></el-icon>
                  <span>{{ option.label }}</span>
                </span>
              </el-option>
            </el-select>
          </div>

          <div class="library-field library-field--tight">
            <div class="library-field-label">{{ t('library.color') }}</div>
            <div class="library-color-row">
              <button
                v-for="color in colorOptions"
                :key="color"
                type="button"
                class="library-color-dot"
                :class="{ selected: form.color === color, disabled: readonly }"
                :style="{ background: color }"
                :disabled="readonly"
                @click="form.color = color"
              />
            </div>
          </div>

          <div v-if="kind === 'echo'" class="library-field library-field--tight">
            <div class="library-field-label">{{ t('library.echoSyntax') }}</div>
            <div class="library-syntax-help">
              <div><code>@{{ form.name || t('library.echoSyntaxName') }}{}()</code></div>
              <div class="library-syntax-desc">{{ t('library.echoSyntaxHint') }}</div>
            </div>
          </div>

          <div v-if="kind === 'rune'" class="library-field library-field--tight">
            <div class="library-field-label">{{ t('library.inherit') }}</div>
            <el-switch v-model="inheritOn" :disabled="readonly" />
            <div class="library-field-hint">{{ t('library.inheritHint') }}</div>
          </div>
        </div>

        <div class="library-form-editor">
          <div class="library-editor-toolbar">
            <div class="library-field-label">
              {{ kind === 'rune' ? t('library.runeTemplateContent') : t('library.echoAnnoSource') }}
            </div>
            <div class="library-editor-actions">
              <el-select
                v-if="kind === 'rune' && !readonly"
                v-model="presetId"
                clearable
                filterable
                class="library-preset-select"
                :placeholder="t('library.templatePresetPlaceholder')"
                @change="applyPreset"
              >
                <el-option-group v-for="group in presetGroups" :key="group.key" :label="t(group.label)">
                  <el-option v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id">
                    <span class="preset-name">{{ item.name }}</span>
                    <span class="preset-desc">{{ item.desc }}</span>
                  </el-option>
                </el-option-group>
              </el-select>
              <el-button v-if="!readonly" text class="library-editor-action" @click="resetTemplate">
                {{ t('library.resetTemplate') }}
              </el-button>
            </div>
          </div>
          <div class="code-editor-wrap">
            <SourceEditor
              v-model="source"
              :theme="appStore.theme"
              :readonly="readonly"
              :language="kind === 'rune' ? 'html' : 'javascript'"
            />
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ t(readonly ? 'window.close' : 'action.cancel') }}</el-button>
      <el-button v-if="!readonly" type="primary" :loading="saving" @click="submit">{{ t('action.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { MagicStick } from '@element-plus/icons-vue';
import SourceEditor from './SourceEditor.vue';
import { ECHO_ICON_OPTIONS, RUNE_ICON_OPTIONS, libraryIconOf } from '@/utils/libraryIcons';
import { randomUUID } from '@/utils/id';
import { useLibraryStore } from '@/stores/library';
import { busDialogBus } from '@/services/busDialogBus';
import { buildEchoCodeGenPrompt, buildRuneCodeGenPrompt } from '@/utils/aiCodegen';
import { EchoCategoryEnum, RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';
import { hasEchoParens, hasRuneTemplateDiv } from '@/utils/parsingRules';
import { useAppStore } from '@/stores/app';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { defaultRuneTemplate, runeTemplateBuiltins } from '@shared/builtins/catalog';

/**
 * 符文/回响表单：一个对话框管两种卡片，靠 kind 区分字段。
 * 编辑时回填现有值；新增时 id 在打开瞬间生成。
 */
const props = defineProps<{
  modelValue: boolean;
  kind: 'rune' | 'echo';
  editing: RuneCard | EchoCard | null;
  initialCategory?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'saved'): void;
}>();

const { t } = useI18n();
const libraryStore = useLibraryStore();
const appStore = useAppStore();
const saving = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const exists = computed(() => Boolean(props.editing));

const form = reactive({
  id: '',
  name: '',
  desc: '',
  color: '#7E57C2',
  icon: 'whatshot',
  category: 'general',
});

/** 分类下拉：label 是 i18n key，模板里 t() 翻译（与 app.ts 同款用法）。 */
const categoryOptions = computed(() =>
  (props.kind === 'rune' ? RuneCategoryEnum : EchoCategoryEnum).items as Array<{ value: string; label: string }>,
);
const source = ref('');
const inheritOn = ref(false);
const presetId = ref('');
/** vue2 runeFormFields/echoFormFields 的圆点色卡，颜色顺序原样搬过来。 */
const RUNE_COLORS = ['#FF6B35', '#4FC3F7', '#AB47BC', '#66BB6A', '#7E57C2', '#FFD54F', '#EF5350', '#26A69A', '#FF7043', '#5C6BC0', '#EC407A', '#8D6E63'];
const ECHO_COLORS = ['#26A69A', '#5C6BC0', '#EC407A', '#FF7043', '#8E24AA', '#42A5F5', '#9CCC65', '#FFA726'];
const iconOptions = computed(() => (props.kind === 'rune' ? RUNE_ICON_OPTIONS : ECHO_ICON_OPTIONS));
const colorOptions = computed(() => (props.kind === 'rune' ? RUNE_COLORS : ECHO_COLORS));
const runePresets = runeTemplateBuiltins();

/** 内置模板按分类分组，顺序固定：通用 → 简历。 */
const presetGroups = computed(() =>
  [
    { key: 'general', label: 'runeCategoryGeneral' },
    { key: 'resume', label: 'runeCategoryResume' },
  ].map((group) => ({
    ...group,
    items: runePresets.filter((item) => item.category === group.key),
  })),
);

/** 选中内置模板：覆盖模板内容；名称/描述为空时带入，分类跟随模板（对齐 vue2 onPresetPicked）。 */
function applyPreset(id: string): void {
  const preset = runePresets.find((item) => item.id === id);
  if (!preset) {
    return;
  }
  source.value = preset.payload.template;
  if (!form.name.trim()) {
    form.name = preset.name;
  }
  if (!form.desc.trim()) {
    form.desc = preset.desc;
  }
  form.category = preset.category;
}

/** 重置回 vue2 默认的 inheritFromPrevious 演示模板。 */
function resetTemplate(): void {
  source.value = defaultRuneTemplate();
  presetId.value = '';
}

/**
 * 对齐 vue2 runeFormDialog/echoFormDialog 的 handleRequestAiHelp：
 * 通过 busDialog 打开 AI 助手，预填完整 prompt，生成后回调写入当前源码框。
 */
function requestAiHelp(): void {
  const isRune = props.kind === 'rune';
  const prompt = isRune
    ? buildRuneCodeGenPrompt({ desc: form.desc, current: source.value })
    : buildEchoCodeGenPrompt({ desc: form.desc, current: source.value });
  busDialogBus.emit('AiHelperBusDialog.open', {
    codeGenPrompt: prompt,
    codeGenType: props.kind,
    codeGenTargetName: form.name.trim() || t(isRune ? 'library.newRune' : 'library.newEcho'),
    codeGenCallback: (code: string) => {
      source.value = code;
    },
  });
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      return;
    }
    presetId.value = '';
    if (props.editing) {
      form.id = props.editing.id;
      form.name = props.editing.name;
      form.desc = props.editing.desc;
      form.color = props.editing.color;
      form.icon = props.editing.icon || (props.kind === 'rune' ? 'whatshot' : 'graphic_eq');
      form.category = resolveLibraryCategory(props.kind, props.editing.category);
      if (props.kind === 'rune') {
        source.value = (props.editing as RuneCard).template;
        inheritOn.value = Boolean((props.editing as RuneCard).inheritFromPrevious);
      } else {
        source.value = (props.editing as EchoCard).annoSource;
      }
    } else {
      form.id = `${props.kind === 'rune' ? 'r' : 'e'}-${randomUUID()}`;
      form.name = '';
      form.desc = '';
      form.color = props.kind === 'rune' ? '#7E57C2' : '#26A69A';
      form.icon = props.kind === 'rune' ? 'whatshot' : 'graphic_eq';
      form.category = resolveLibraryCategory(props.kind, props.initialCategory);
      // vue2 createRuneForm 新增默认就是 inheritFromPrevious 演示模板，开关默认开。
      source.value = props.kind === 'rune' ? defaultRuneTemplate() : '';
      inheritOn.value = props.kind === 'rune';
      presetId.value = '';
    }
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  if (props.readonly) return;
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning(t('library.nameRequired'));
    return;
  }
  // 解析开关校验（对齐 vue2 runeFormDialog/echoFormDialog submit 前置检查）
  if (props.kind === 'rune' && appStore.prefs['parsing.runeRequireTemplateDiv'] === true
    && !hasRuneTemplateDiv(source.value)) {
    ElMessage.warning(t('editorParsingRuneDivMissing'));
    return;
  }
  if (props.kind === 'echo' && appStore.prefs['parsing.echoRequireParens'] !== false
    && !hasEchoParens(source.value, name)) {
    ElMessage.warning(t('editorParsingEchoParensMissing'));
    return;
  }
  saving.value = true;
  try {
    if (props.kind === 'rune') {
      const saved = await libraryStore.saveRuneCard({
        id: form.id,
        name,
        desc: form.desc.trim(),
        color: form.color,
        icon: form.icon,
        category: form.category,
        sortOrder: props.editing?.sortOrder,
        template: source.value,
        inheritFromPrevious: inheritOn.value ? 1 : 0,
      });
      if (!saved) {
        ElMessage.error(libraryStore.error || t('library.saveFailed'));
        return;
      }
    } else {
      const saved = await libraryStore.saveEchoCard({
        id: form.id,
        name,
        desc: form.desc.trim(),
        color: form.color,
        icon: form.icon,
        category: form.category,
        sortOrder: props.editing?.sortOrder,
        renderType: (props.editing as EchoCard | null)?.renderType,
        annoSource: source.value,
      });
      if (!saved) {
        ElMessage.error(libraryStore.error || t('library.saveFailed'));
        return;
      }
    }
    ElMessage.success(t('library.saveSuccess'));
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.library-form-body {
  height: 100%;
  min-height: 0;
}

.library-form-content {
  display: flex;
  align-items: stretch;
  gap: 14px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.library-form-fields {
  flex: 0 0 220px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
}

.library-form-fields--echo {
  flex-basis: 240px;
}

.library-field {
  margin-bottom: 12px;
}

.library-field:last-child {
  margin-bottom: 0;
}

.library-field--tight {
  margin-bottom: 10px;
}

.library-field-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--el-text-color-secondary);
}

.library-syntax-help {
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.library-syntax-help code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  color: var(--el-color-primary);
}

.library-syntax-desc {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}

.library-field-hint {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.65;
  color: var(--el-text-color-secondary);
}

.library-input {
  width: 100%;
}

.library-input :deep(.el-input__inner),
.library-input :deep(.el-textarea__inner) {
  font-size: 13px;
}

.library-input :deep(.el-input__wrapper) {
  min-height: 36px;
}

.library-input :deep(.el-textarea__inner) {
  min-height: 72px !important;
}

.library-ai-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #7c4dff;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s, transform 0.2s;
}

.library-ai-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.library-color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.library-color-dot {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.library-color-dot:hover {
  transform: scale(1.12);
}

.library-color-dot.selected {
  border-color: var(--el-color-white);
  box-shadow: 0 0 0 2px rgb(0 0 0 / 40%);
}

.library-color-dot.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.library-form-editor {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.library-editor-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.library-editor-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.library-preset-select {
  width: 220px;
}

.library-editor-action {
  min-height: 28px;
  padding: 4px 6px;
  font-size: 12px;
}

.library-form-editor .code-editor-wrap {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.library-form-editor .code-editor-wrap :deep(.source-editor) {
  flex: 1;
  min-height: 0;
  border-color: var(--el-border-color);
  border-radius: 4px;
}

.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.preset-name {
  font-size: 13px;
}

.preset-desc {
  float: right;
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
