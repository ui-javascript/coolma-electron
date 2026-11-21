<template>
  <el-dialog
    :model-value="modelValue"
    width="760px"
    top="8vh"
    append-to-body
    :show-close="false"
    class="pack-import-dialog"
    @update:model-value="close"
  >
    <div class="pack-import-toolbar">
      <el-icon class="pack-import-toolbar-icon"><UploadFilled /></el-icon>
      <span class="pack-import-toolbar-title">{{ dialogTitle }}</span>
      <button type="button" class="pack-import-close" :title="t('action.close')" @click="close(false)">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="pack-import-body">
      <el-tabs v-model="sourceTab" class="pack-import-tabs">
        <el-tab-pane name="file">
          <template #label>
            <span class="pack-import-tab-label">
              <el-icon><Document /></el-icon>
              {{ t('pack.sourceFile') }}
            </span>
          </template>

          <div class="pack-import-field">
            <div class="pack-import-label">{{ t('pack.fileLabel') }}</div>
            <div class="pack-import-file" @click="triggerFileInput">
              <input
                ref="fileInput"
                type="file"
                accept=".json"
                style="display: none"
                @change="onFileSelected"
              />
              <div v-if="!fileName" class="pack-import-file-empty">
                <el-icon><UploadFilled /></el-icon>
                <span>{{ t('pack.filePick') }}</span>
              </div>
              <div v-else class="pack-import-file-selected">
                <el-icon class="pack-import-file-icon"><Document /></el-icon>
                <span class="pack-import-file-name">{{ fileName }}</span>
                <button type="button" class="pack-import-file-remove" @click.stop="clearFile">
                  <el-icon><Close /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="url">
          <template #label>
            <span class="pack-import-tab-label">
              <el-icon><Link /></el-icon>
              {{ t('pack.sourceUrl') }}
            </span>
          </template>

          <div class="pack-import-field">
            <div class="pack-import-label">
              {{ kind === 'echoes' ? t('pack.urlLabelEcho') : t('pack.urlLabelRune') }}
            </div>
            <el-input
              v-model="sourceUrl"
              :placeholder="t('pack.urlPlaceholder')"
              clearable
              size="small"
              :disabled="fetchingRemote"
              class="pack-import-url"
            />
            <div class="pack-import-hint">{{ t('pack.urlHint') }}</div>
            <div class="pack-import-url-actions">
              <button
                type="button"
                class="pack-import-action-btn"
                :disabled="!sourceUrl || fetchingRemote"
                @click="fetchRemote"
              >
                <el-icon :class="{ 'is-loading': fetchingRemote }"><Download /></el-icon>
                {{ fetchingRemote ? t('pack.urlFetching') : t('pack.urlFetch') }}
              </button>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div class="pack-import-field">
        <div class="pack-import-label">{{ t('pack.categoryLabel') }}</div>
        <el-select v-model="targetCategory" size="small" class="pack-import-select">
          <el-option v-for="item in categoryItems" :key="item.value" :label="t(item.label)" :value="item.value" />
        </el-select>
        <div class="pack-import-hint">{{ t('pack.categoryHint') }}</div>
      </div>

      <div v-if="preview" class="pack-import-preview">
        <div class="pack-import-preview-title">
          <span>{{ t(kind === 'echoes' ? 'pack.previewEcho' : 'pack.previewRune', { count: parsedEntryCount }) }}</span>
          <span v-if="builtinBlocked.length" class="pack-import-meta">
            {{ t('pack.filteredBuiltin', { count: builtinBlocked.length }) }}
          </span>
          <span v-if="invalidItems.length" class="pack-import-meta is-warning">
            {{ t('pack.invalidCount', { count: invalidItems.length }) }}
          </span>
          <span v-if="fileDuplicates.length" class="pack-import-meta">
            {{ t('pack.fileDupCount', { count: fileDuplicates.length }) }}
          </span>
        </div>

        <div v-if="newItems.length === 0 && conflictItems.length > 0" class="pack-import-all-conflict">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ t('pack.allConflict', { count: conflictItems.length }) }}</span>
        </div>

        <div class="pack-import-sides">
          <section class="pack-import-side">
            <div class="pack-import-side-title is-new">
              <el-icon><CircleCheckFilled /></el-icon>
              <span>{{ t('pack.newGroup', { count: newItems.length }) }}</span>
            </div>
            <div class="pack-import-side-actions">
              <button type="button" class="pack-import-mini" :disabled="!newItems.length" @click="selectAll('new', true)">
                {{ t('pack.selectAll') }}
              </button>
              <button type="button" class="pack-import-mini" :disabled="!newItems.length" @click="selectAll('new', false)">
                {{ t('pack.selectNone') }}
              </button>
            </div>
            <div v-if="!newItems.length" class="pack-import-side-empty">{{ t('pack.noNew') }}</div>
            <el-checkbox-group v-else v-model="selectedNew" class="pack-tile-group">
              <el-checkbox v-for="item in newItems" :key="item.name" :value="item.name" :label="item.name" />
            </el-checkbox-group>
          </section>

          <section class="pack-import-side">
            <div class="pack-import-side-title is-conflict">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ t('pack.conflictGroup', { count: conflictItems.length }) }}</span>
            </div>
            <div class="pack-import-side-actions">
              <button type="button" class="pack-import-mini" :disabled="!conflictItems.length" @click="selectAll('conflict', true)">
                {{ t('pack.selectAll') }}
              </button>
              <button type="button" class="pack-import-mini" :disabled="!conflictItems.length" @click="selectAll('conflict', false)">
                {{ t('pack.selectNone') }}
              </button>
            </div>
            <div v-if="!conflictItems.length" class="pack-import-side-empty">{{ t('pack.noConflict') }}</div>
            <el-checkbox-group v-else v-model="selectedConflict" class="pack-tile-group pack-tile-group--conflict">
              <el-checkbox v-for="item in conflictItems" :key="item.name" :value="item.name" :label="item.name" />
            </el-checkbox-group>
          </section>
        </div>

        <div v-if="invalidItems.length" class="pack-import-invalid">
          <div v-for="item in invalidItems" :key="item.name + item.reason" class="pack-import-invalid-line">
            {{ item.name }}：{{ item.reason }}
          </div>
        </div>
      </div>

      <div v-if="parseError" class="pack-import-error">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ parseError }}</span>
      </div>
    </div>

    <template #footer>
      <div class="pack-import-footer">
        <button type="button" class="pack-import-cancel" @click="close(false)">{{ t('action.cancel') }}</button>
        <button
          type="button"
          class="pack-import-main"
          :disabled="!preview || !hasSelected"
          :class="{ 'is-loading': importing }"
          @click="commit"
        >
          <el-icon v-if="!importing"><Upload /></el-icon>
          <el-icon v-else class="is-loading"><Loading /></el-icon>
          {{ t('pack.importSelected') }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  CircleCheckFilled,
  Close,
  Document,
  Download,
  InfoFilled,
  Link,
  Loading,
  Upload,
  UploadFilled,
  WarningFilled,
} from '@element-plus/icons-vue';
import {
  computeFileDuplicates,
  parseEchoPack,
  parseRunePack,
  type PackKind,
  type PackParseResult,
} from '@/services/pack';
import { commitPack, fetchRemotePack, previewPack } from '@/services/ipc';
import { EchoCategoryEnum, RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';

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
  initialCategory?: string;
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
const fetchingRemote = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const categoryItems = computed(() =>
  props.kind === 'echoes'
    ? (EchoCategoryEnum.items as Array<{ value: string; label: string }>).filter(
        (item) => item.value !== EchoCategoryEnum.Builtin,
      )
    : (RuneCategoryEnum.items as Array<{ value: string; label: string }>),
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
const parsedEntryCount = computed(() => parsed.value?.entries.length ?? 0);
const hasSelected = computed(
  () => selectedNew.value.length > 0 || selectedConflict.value.length > 0,
);

watch(
  () => [props.modelValue, props.kind] as const,
  ([visible]) => {
    if (!visible) {
      return;
    }
    reset();
    const kind = props.kind === 'echoes' ? 'echo' : 'rune';
    const initial = resolveLibraryCategory(kind, props.initialCategory);
    targetCategory.value = kind === 'echo' && initial === EchoCategoryEnum.Builtin
      ? EchoCategoryEnum.Marker
      : initial;
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
  fetchingRemote.value = false;
}

function close(visible: boolean): void {
  emit('update:modelValue', visible);
}

function triggerFileInput(): void {
  fileInput.value?.click();
}

function clearFile(): void {
  fileName.value = '';
  parsed.value = null;
  preview.value = null;
  selectedNew.value = [];
  selectedConflict.value = [];
  parseError.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
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
  if (!url || fetchingRemote.value) {
    return;
  }
  fetchingRemote.value = true;
  try {
    const result = await fetchRemotePack(url);
    if (!result.ok) {
      parseError.value = result.error.message;
      parsed.value = null;
      preview.value = null;
      return;
    }
    fileName.value = result.data.finalUrl;
    parseText(result.data.text);
  } finally {
    fetchingRemote.value = false;
  }
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

function selectAll(group: 'new' | 'conflict', selected: boolean): void {
  const items = group === 'new' ? newItems.value : conflictItems.value;
  const names = items.map((item) => item.name);
  if (group === 'new') {
    selectedNew.value = selected ? names : [];
  } else {
    selectedConflict.value = selected ? names : [];
  }
}

async function commit(): Promise<void> {
  if (!parsed.value || !preview.value || !hasSelected.value) {
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

<style scoped>
.pack-import-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 4px 8px 4px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.pack-import-toolbar-icon {
  color: var(--el-color-primary);
  font-size: 20px;
}

.pack-import-toolbar-title {
  flex: 1;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 700;
}

.pack-import-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.pack-import-close:hover {
  background: var(--el-fill-color);
}

.pack-import-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.pack-import-tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
  border-bottom: 1px solid rgb(126 87 194 / 18%);
}

.pack-import-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.pack-import-tabs :deep(.el-tabs__item) {
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
}

.pack-import-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.pack-import-field {
  display: flex;
  flex-direction: column;
}

.pack-import-label {
  margin-bottom: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  font-weight: 500;
}

.pack-import-file {
  padding: 24px;
  border: 2px dashed rgb(126 87 194 / 35%);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.pack-import-file:hover {
  border-color: #7e57c2;
  background: rgb(126 87 194 / 4%);
}

.pack-import-file-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.pack-import-file-empty :deep(.el-icon) {
  color: var(--el-text-color-placeholder);
  font-size: 38px;
}

.pack-import-file-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.pack-import-file-icon {
  color: #7e57c2;
  font-size: 22px;
}

.pack-import-file-name {
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pack-import-file-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.pack-import-file-remove:hover {
  background: var(--el-fill-color);
}

.pack-import-url {
  width: 100%;
}

.pack-import-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.pack-import-url-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.pack-import-action-btn,
.pack-import-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 12px;
  cursor: pointer;
}

.pack-import-action-btn:hover,
.pack-import-mini:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.pack-import-action-btn:disabled,
.pack-import-mini:disabled {
  color: var(--el-text-color-disabled);
  cursor: default;
}

.pack-import-select {
  width: 100%;
}

.pack-import-preview {
  padding: 12px;
  border-radius: 6px;
  background: rgb(126 87 194 / 6%);
}

.pack-import-preview-title {
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.pack-import-meta {
  margin-left: 6px;
}

.pack-import-meta.is-warning {
  color: var(--el-color-warning);
}

.pack-import-all-conflict {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgb(255 152 0 / 10%);
  color: #e65100;
  font-size: 12px;
  line-height: 1.5;
}

.pack-import-sides {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 2px;
}

.pack-import-side {
  padding: 10px;
  border: 1px solid rgb(126 87 194 / 18%);
  border-radius: 6px;
  background: rgb(255 255 255 / 60%);
}

.pack-import-side-title {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 500;
}

.pack-import-side-title.is-new :deep(.el-icon) {
  color: var(--el-color-success);
}

.pack-import-side-title.is-conflict :deep(.el-icon) {
  color: var(--el-color-warning);
}

.pack-import-side-actions {
  display: flex;
  gap: 2px;
  margin: 2px 0 6px;
}

.pack-import-side-empty {
  padding: 6px 2px;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

.pack-tile-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
}

.pack-tile-group :deep(.el-checkbox) {
  height: auto;
  min-width: 0;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 4px;
  background: rgb(255 255 255 / 85%);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.pack-tile-group :deep(.el-checkbox:hover) {
  border-color: rgb(126 87 194 / 40%);
  background: rgb(126 87 194 / 6%);
}

.pack-tile-group :deep(.el-checkbox.is-checked) {
  border-color: #7e57c2;
  background: rgb(126 87 194 / 12%);
}

.pack-tile-group :deep(.el-checkbox__label) {
  min-width: 0;
  padding-left: 6px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pack-tile-group--conflict :deep(.el-checkbox) {
  border-color: rgb(255 193 7 / 45%);
}

.pack-tile-group--conflict :deep(.el-checkbox.is-checked) {
  border-color: #f57c00;
  background: rgb(255 193 7 / 14%);
}

.pack-import-invalid {
  margin-top: 8px;
  color: var(--el-color-danger);
  font-size: 11px;
  line-height: 1.6;
}

.pack-import-error {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgb(244 67 54 / 8%);
  color: #c62828;
  font-size: 12px;
  line-height: 1.5;
}

.pack-import-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pack-import-cancel {
  padding: 5px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 13px;
  cursor: pointer;
}

.pack-import-cancel:hover {
  background: var(--el-fill-color);
}

.pack-import-main {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 13px;
  cursor: pointer;
}

.pack-import-main:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.pack-import-main:disabled {
  color: var(--el-text-color-disabled);
  cursor: default;
}

</style>
