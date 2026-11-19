<template>
  <el-dialog :model-value="modelValue" :title="dialogTitle" width="680px" @update:model-value="close">
    <el-tabs v-model="sourceTab">
      <el-tab-pane :label="t('pack.sourceFile')" name="file" />
      <el-tab-pane :label="t('pack.sourceUrl')" name="url" />
    </el-tabs>

    <div v-show="sourceTab === 'file'" class="pack-file-area" @click="triggerFileInput">
      <input ref="fileInput" type="file" accept=".json" style="display: none" @change="onFileSelected" />
      <span v-if="!fileName" class="pack-file-placeholder">{{ t('pack.filePlaceholder') }}</span>
      <span v-else class="pack-file-name">{{ fileName }}</span>
    </div>
    <div v-show="sourceTab === 'url'" class="pack-url-area">
      <el-input v-model="sourceUrl" :placeholder="t('pack.urlPlaceholder')" clearable @change="fetchRemote" />
    </div>

    <div class="pack-category-row">
      <span class="pack-label">{{ t('pack.targetCategory') }}</span>
      <el-select v-model="targetCategory" size="small" class="pack-category-select">
        <el-option v-for="item in categoryItems" :key="item.value" :label="t(item.label)" :value="item.value" />
      </el-select>
    </div>

    <el-alert v-if="parseError" type="error" :title="parseError" :closable="false" class="pack-alert" />

    <template v-if="preview">
      <div class="pack-groups">
        <p class="pack-group-title">{{ t('pack.newItems', { count: newItems.length }) }}</p>
        <el-checkbox-group v-model="selectedNew">
          <el-checkbox v-for="item in newItems" :key="item.name" :value="item.name" :label="item.name" />
        </el-checkbox-group>
        <p class="pack-group-title">{{ t('pack.conflictItems', { count: conflictItems.length }) }}</p>
        <el-checkbox-group v-model="selectedConflict">
          <el-checkbox v-for="item in conflictItems" :key="item.name" :value="item.name" :label="item.name" />
        </el-checkbox-group>
        <p v-if="builtinBlocked.length" class="pack-group-title">
          {{ t('pack.builtinBlocked', { count: builtinBlocked.length }) }}
        </p>
        <p v-if="invalidItems.length" class="pack-group-title">
          {{ t('pack.invalidItems', { count: invalidItems.length }) }}
        </p>
        <p v-if="fileDuplicates.length" class="pack-group-title">
          {{ t('pack.fileDuplicates', { count: fileDuplicates.length }) }}
        </p>
      </div>
    </template>

    <template #footer>
      <el-button @click="close(false)">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" :loading="importing" :disabled="!preview" @click="commit">
        {{ t('pack.import') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  computeFileDuplicates,
  parseEchoPack,
  parseRunePack,
  type PackKind,
  type PackParseResult,
} from '@/services/pack';
import { commitPack, fetchRemotePack, previewPack } from '@/services/ipc';
import { EchoCategoryEnum, RuneCategoryEnum } from '@shared/enums/library';

type PreviewGroup = {
  previewAt: number;
  newItems: Array<{ index: number; name: string; selected: boolean }>;
  conflictItems: Array<{ index: number; name: string; selected: boolean }>;
  builtinBlocked: Array<{ index: number; name: string }>;
  invalidItems: Array<{ index: number; reason: string; name: string }>;
};

const props = defineProps<{
  modelValue: boolean;
  kind: PackKind;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'imported'): void;
}>();

const { t } = useI18n();

const sourceTab = ref<'file' | 'url'>('file');
const sourceUrl = ref('');
const fileName = ref('');
const targetCategory = ref('');
const parseError = ref('');
const parsed = ref<PackParseResult | null>(null);
const preview = ref<PreviewGroup | null>(null);
const selectedNew = ref<string[]>([]);
const selectedConflict = ref<string[]>([]);
const importing = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const categoryItems = computed(() =>
  props.kind === 'echoes'
    ? (EchoCategoryEnum.items as Array<{ value: string; label: string }>)
    : (RuneCategoryEnum.items as Array<{ value: string; label: string }>)
);

const dialogTitle = computed(() =>
  props.kind === 'echoes' ? t('pack.echoTitle') : t('pack.runeTitle'),
);

const newItems = computed(() => preview.value?.newItems ?? []);
const conflictItems = computed(() => preview.value?.conflictItems ?? []);
const builtinBlocked = computed(() => preview.value?.builtinBlocked ?? []);
const invalidItems = computed(() => preview.value?.invalidItems ?? []);
const fileDuplicates = computed(() =>
  parsed.value ? computeFileDuplicates(parsed.value.entries) : [],
);

watch(
  () => [props.modelValue, props.kind] as const,
  ([visible]) => {
    if (!visible) {
      return;
    }
    reset();
    targetCategory.value = props.kind === 'echoes' ? 'marker' : 'general';
  },
  { immediate: true },
);

function reset(): void {
  sourceTab.value = 'file';
  sourceUrl.value = '';
  fileName.value = '';
  parseError.value = '';
  parsed.value = null;
  preview.value = null;
  selectedNew.value = [];
  selectedConflict.value = [];
}

function close(visible: boolean): void {
  emit('update:modelValue', visible);
}

function triggerFileInput(): void {
  fileInput.value?.click();
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  fileName.value = file.name;
  const text = await file.text();
  parseText(text);
  input.value = '';
}

async function fetchRemote(): Promise<void> {
  const url = sourceUrl.value.trim();
  if (!url) {
    return;
  }
  const result = await fetchRemotePack(url);
  if (!result.ok) {
    parseError.value = result.error.message;
    parsed.value = null;
    preview.value = null;
    return;
  }
  fileName.value = result.data.finalUrl;
  parseText(result.data.text);
}

function parseText(text: string): void {
  parseError.value = '';
  preview.value = null;
  const result = props.kind === 'echoes' ? parseEchoPack(text) : parseRunePack(text);
  parsed.value = result;
  if (!result.success) {
    parseError.value = result.message ?? t('pack.parseFailed');
    return;
  }
  void runPreview(result);
}

async function runPreview(result: PackParseResult): Promise<void> {
  const group = await previewPack({
    kind: props.kind,
    entries: result.entries.map((entry) => entry.normalized),
    targetCategory: targetCategory.value,
  });
  if (!group.ok) {
    parseError.value = group.error.message;
    return;
  }
  preview.value = group.data;
  selectedNew.value = group.data.newItems.filter((item) => item.selected).map((item) => item.name);
  selectedConflict.value = group.data.conflictItems.filter((item) => item.selected).map((item) => item.name);
}

async function commit(): Promise<void> {
  if (!parsed.value || !preview.value) {
    return;
  }
  importing.value = true;
  try {
    const sourceByName: Record<string, Record<string, unknown>> = {};
    for (const entry of parsed.value.entries) {
      sourceByName[String(entry.normalized.name)] = entry.normalized;
    }
    const result = await commitPack({
      kind: props.kind,
      createNames: selectedNew.value,
      replaceNames: selectedConflict.value,
      targetCategory: targetCategory.value,
      previewAt: preview.value.previewAt,
      sourceByName,
    });
    if (!result.ok) {
      ElMessage.error(result.error.message);
      return;
    }
    ElMessage.success(
      t('pack.importDone', { created: result.data.created, replaced: result.data.replaced }),
    );
    emit('imported');
    close(false);
  } finally {
    importing.value = false;
  }
}
</script>
