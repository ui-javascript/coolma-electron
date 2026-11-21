<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('library.remoteRuneTitle')"
    width="540px"
    append-to-body
    @update:model-value="close"
  >
    <el-form label-width="96px" class="remote-rune-form">
      <el-form-item :label="t('library.remoteRuneUrlLabel')">
        <el-input
          v-model="sourceUrl"
          :placeholder="t('library.remoteRuneUrlPlaceholder')"
          clearable
          spellcheck="false"
          @keyup.enter="submit"
        />
        <div class="field-hint">{{ t('library.remoteRuneHint') }}</div>
      </el-form-item>
      <el-form-item :label="t('library.remoteRuneCategoryLabel')">
        <el-select v-model="category" clearable :placeholder="t('library.remoteRuneAuto')" class="remote-rune-category">
          <el-option v-for="item in categoryItems" :key="item.value" :label="t(item.label)" :value="item.value" />
        </el-select>
      </el-form-item>
    </el-form>

    <el-alert v-if="error" type="error" :title="error" :closable="false" />

    <template #footer>
      <el-button :disabled="importing" @click="close(false)">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" :loading="importing" :disabled="!sourceUrl.trim()" @click="submit">
        {{ t('library.remoteRuneImport') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { fetchRemotePack, saveRune } from '@/services/ipc';
import { inferRemoteRuneMeta, REMOTE_RUNE_MAX_BYTES } from '@shared/runeRemote';
import { RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';
import type { RuneCard } from '@shared/types/domain';

const props = defineProps<{
  modelValue: boolean;
  initialCategory?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'imported', rune: RuneCard): void;
}>();

const { t } = useI18n();
const sourceUrl = ref('');
const category = ref('');
const importing = ref(false);
const error = ref('');

const categoryItems = computed(() => RuneCategoryEnum.items as Array<{ value: string; label: string }>);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = '';
      sourceUrl.value = '';
      category.value = resolveLibraryCategory('rune', props.initialCategory);
    }
  },
);

function close(value = false): void {
  if (!importing.value) {
    emit('update:modelValue', value);
  }
}

function remoteId(): string {
  return `rune_remote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function submit(): Promise<void> {
  const url = sourceUrl.value.trim();
  if (!url || importing.value) {
    return;
  }
  importing.value = true;
  error.value = '';
  try {
    const fetched = await fetchRemotePack(url);
    if (!fetched.ok) {
      error.value = t('library.remoteRuneFailed', { message: fetched.error.message });
      return;
    }
    const text = fetched.data.text;
    if (new TextEncoder().encode(text).byteLength > REMOTE_RUNE_MAX_BYTES) {
      error.value = t('library.remoteRuneTooLarge');
      return;
    }
    const meta = inferRemoteRuneMeta(text, fetched.data.finalUrl, category.value);
    const saved = await saveRune({
      id: remoteId(),
      name: meta.name.slice(0, 100),
      desc: meta.desc.slice(0, 2000),
      color: '#7E57C2',
      icon: 'cloud_download',
      template: text,
      category: resolveLibraryCategory('rune', meta.category),
      sortOrder: 9999,
      inheritFromPrevious: 0,
    });
    if (!saved.ok) {
      const message = saved.error.message.includes('RUNE_DUPLICATE_NAME')
        ? t('library.remoteRuneDuplicate', { name: meta.name })
        : saved.error.message;
      error.value = t('library.remoteRuneFailed', { message });
      return;
    }
    emit('imported', saved.data);
    ElMessage.success(t('library.remoteRuneDone', { name: saved.data.name }));
    emit('update:modelValue', false);
  } catch (caught) {
    error.value = t('library.remoteRuneFailed', {
      message: caught instanceof Error ? caught.message : String(caught),
    });
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.remote-rune-form {
  margin-bottom: 4px;
}
.remote-rune-category {
  width: 100%;
}
</style>
