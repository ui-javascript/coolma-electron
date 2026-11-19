<template>
  <el-dialog
    v-model="visible"
    :title="readonly ? t('library.viewCard') : kind === 'rune' ? t(exists ? 'library.editRune' : 'library.newRune') : t(exists ? 'library.editEcho' : 'library.newEcho')"
    width="560px"
    append-to-body
    destroy-on-close
  >
    <el-form label-width="92px" @submit.prevent>
      <el-form-item :label="t('library.name')" required>
        <el-input v-model="form.name" :readonly="readonly" :placeholder="t('library.namePlaceholder')" maxlength="100" />
      </el-form-item>
      <el-form-item :label="t('library.desc')">
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
      <el-form-item :label="t('library.source')">
        <el-input
          v-model="source"
          :readonly="readonly"
          type="textarea"
          :rows="kind === 'rune' ? 8 : 6"
          :placeholder="kind === 'rune' ? t('library.templatePlaceholder') : t('library.annoPlaceholder')"
          class="mono"
        />
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
import { randomUUID } from '@/utils/id';
import { useLibraryStore } from '@/stores/library';
import { EchoCategoryEnum, RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';
import { hasEchoParens, hasRuneTemplateDiv } from '@/utils/parsingRules';
import { useAppStore } from '@/stores/app';
import type { EchoCard, RuneCard } from '@shared/types/domain';

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
  category: 'general',
});

/** 分类下拉：label 是 i18n key，模板里 t() 翻译（与 app.ts 同款用法）。 */
const categoryOptions = computed(() =>
  (props.kind === 'rune' ? RuneCategoryEnum : EchoCategoryEnum).items as Array<{ value: string; label: string }>,
);
const source = ref('');
const inheritOn = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      return;
    }
    if (props.editing) {
      form.id = props.editing.id;
      form.name = props.editing.name;
      form.desc = props.editing.desc;
      form.color = props.editing.color;
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
      form.category = resolveLibraryCategory(props.kind, props.initialCategory);
      source.value = '';
      inheritOn.value = false;
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
        icon: props.editing?.icon,
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
        icon: props.editing?.icon,
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

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
