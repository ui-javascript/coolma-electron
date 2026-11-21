<template>
  <el-dialog
    v-model="visible"
    :title="readonly ? t('library.viewCard') : kind === 'rune' ? t(exists ? 'library.editRune' : 'library.newRune') : t(exists ? 'library.editEcho' : 'library.newEcho')"
    width="760px"
    append-to-body
    destroy-on-close
  >
    <el-form label-width="92px" @submit.prevent>
      <el-form-item :label="t('library.name')" required>
        <el-input v-model="form.name" :readonly="readonly" :placeholder="t('library.namePlaceholder')" maxlength="100" />
      </el-form-item>
      <el-form-item :label="t('library.desc')">
        <template #label>
          <span class="label-with-ai">
            {{ t('library.desc') }}
            <el-tooltip
              v-if="!readonly"
              :content="kind === 'rune' ? t('library.aiGenerateRune') : t('library.aiGenerateEcho')"
              placement="top"
            >
              <el-button text circle size="small" class="ai-gen-btn" @click="requestAiHelp">
                <el-icon><MagicStick /></el-icon>
              </el-button>
            </el-tooltip>
          </span>
        </template>
        <el-input v-model="form.desc" :readonly="readonly" :placeholder="t('library.descPlaceholder')" maxlength="200" />
      </el-form-item>
      <el-form-item :label="t('library.color')">
        <el-color-picker v-model="form.color" :disabled="readonly" />
      </el-form-item>
      <el-form-item :label="t('library.category')">
        <el-select v-model="form.category" :disabled="readonly" filterable class="category-select">
          <el-option
            v-for="option in categoryOptions"
            :key="option.value"
            :label="t(option.label)"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('library.icon')">
        <el-select v-model="form.icon" :disabled="readonly" filterable class="icon-select">
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
      </el-form-item>
      <el-form-item v-if="kind === 'rune' && !readonly" :label="t('library.templatePreset')">
        <div class="template-picker">
          <el-select
            v-model="presetId"
            clearable
            filterable
            class="template-select"
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
          <el-button text @click="resetTemplate">{{ t('library.resetTemplate') }}</el-button>
        </div>
        <span class="form-hint">{{ t('library.templateHint') }}</span>
      </el-form-item>
      <el-form-item :label="t('library.source')" class="source-form-item">
        <div class="code-editor-wrap">
          <SourceEditor
            v-model="source"
            :theme="appStore.theme"
            :readonly="readonly"
            :language="kind === 'rune' ? 'html' : 'javascript'"
          />
        </div>
      </el-form-item>
      <el-form-item v-if="kind === 'rune'" :label="t('library.inherit')">
        <el-switch v-model="inheritOn" :disabled="readonly" />
        <span class="form-hint">{{ t('library.inheritHint') }}</span>
      </el-form-item>
    </el-form>
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
const iconOptions = computed(() => (props.kind === 'rune' ? RUNE_ICON_OPTIONS : ECHO_ICON_OPTIONS));
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
.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.category-select {
  width: 200px;
}

.icon-select {
  width: 200px;
}

.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.source-form-item :deep(.el-form-item__content) {
  width: 100%;
}

.code-editor-wrap {
  display: flex;
  width: 100%;
  height: 300px;
}

.template-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.template-select {
  flex: 1;
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

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.label-with-ai {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ai-gen-btn {
  color: #7c4dff;
  padding: 2px;
}

.ai-gen-btn:hover {
  background: rgba(124, 77, 255, 0.08);
}
</style>
