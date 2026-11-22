<template>
  <div class="melt-sources">
    <div class="melt-sources-toolbar">
      <el-button size="small" :icon="Refresh" :loading="refreshing" @click="refreshAll">
        {{ t('settings.meltRefreshAll') }}
      </el-button>
      <el-button size="small" type="primary" plain :icon="Plus" @click="addSource">
        {{ t('settings.meltAdd') }}
      </el-button>
    </div>

    <p class="melt-sources-hint">{{ t('settings.meltHint') }}</p>
    <p class="melt-sources-hint">{{ t('settings.meltCorsHint') }}</p>

    <el-empty v-if="rows.length === 0" :description="t('settings.meltEmpty')" :image-size="64" />

    <div v-for="(row, index) in rows" :key="row.key" class="melt-source-card">
      <div class="melt-source-row">
        <el-input
          v-model="row.name"
          size="small"
          class="melt-name"
          placeholder="@melt-js/comps-vue2-meme"
          @change="persist"
        />
        <el-select v-model="row.type" size="small" class="melt-type" @change="onTypeChange(row)">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-switch v-model="row.enabled" size="small" :active-text="t('settings.meltEnabled')" @change="persist" />
        <el-button text size="small" :disabled="index === 0" :icon="ArrowUp" @click="move(index, -1)" />
        <el-button text size="small" :disabled="index === rows.length - 1" :icon="ArrowDown" @click="move(index, 1)" />
        <el-button text size="small" type="danger" :icon="Delete" @click="removeSource(index)" />
      </div>

      <div class="melt-source-row melt-source-row--second">
        <el-input
          v-model="row.base"
          size="small"
          class="melt-base"
          :disabled="row.type === 'unpkg'"
          :placeholder="basePlaceholder(row)"
          @change="persist"
        />
        <el-input
          v-model="row.version"
          size="small"
          class="melt-version"
          :disabled="row.type !== 'unpkg'"
          :placeholder="t('settings.meltVersion')"
          @change="persist"
        />
        <el-input
          v-model="row.distDir"
          size="small"
          class="melt-dist"
          :placeholder="defaultDistDirFor(row.name)"
          @change="persist"
        />
      </div>

      <div class="melt-source-preview">
        <el-icon><Link /></el-icon>
        <span class="melt-source-preview-label">{{ t('settings.meltPreview') }}：</span>
        <code :class="{ 'is-empty': !previewOf(row).url }">{{ previewOf(row).url || t('settings.meltInvalid') }}</code>
      </div>

      <div v-if="isOverridden(index)" class="melt-source-warning">
        <el-icon><Warning /></el-icon>
        <span>{{ t('settings.meltOverridden') }}</span>
      </div>
      <div v-if="previewOf(row).warnings.length" class="melt-source-warning">
        <el-icon><InfoFilled /></el-icon>
        <span>{{ previewOf(row).warnings.join('；') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowUp, Delete, InfoFilled, Link, Plus, Refresh, Warning } from '@element-plus/icons-vue';
import { clearAllMeltCaches } from 'libs-muya-rune-vue3';
import {
  MELT_SOURCE_TYPE_OPTIONS,
  MELT_SOURCE_TYPES,
  buildSourceEntryUrl,
  createEmptyRuneSource,
  defaultDistDirFor,
  loadRuneSources,
  normalizeRuneSource,
  saveRuneSources,
  type MeltSource,
} from 'libs-rune-core';

interface MeltRow extends MeltSource {
  key: string;
}

const { t } = useI18n();
let rowSeed = 0;
const refreshing = ref(false);

function toRow(source: MeltSource): MeltRow {
  return {
    ...normalizeRuneSource(source),
    key: `melt-source-${rowSeed++}`,
  };
}

const rows = ref<MeltRow[]>(loadRuneSources().map(toRow));
const typeOptions = MELT_SOURCE_TYPE_OPTIONS;

function previewOf(row: MeltRow): { url: string; warnings: string[] } {
  return buildSourceEntryUrl(row);
}

function basePlaceholder(row: MeltRow): string {
  if (row.type === MELT_SOURCE_TYPES.GITHUB) return 'https://<org>.github.io';
  if (row.type === MELT_SOURCE_TYPES.UNPKG) return 'unpkg.com';
  if (row.type === MELT_SOURCE_TYPES.DIRECT) return 'https://example.com/.../hel-meta.json';
  return 'http://82.156.212.243';
}

function persist(): void {
  const saved = saveRuneSources(rows.value);
  saved.forEach((item, index) => {
    const row = rows.value[index];
    if (!row) return;
    row.base = item.base;
    row.version = item.version;
    row.distDir = item.distDir;
    row.type = item.type;
  });
}

function addSource(): void {
  rows.value.push(toRow(createEmptyRuneSource({ type: MELT_SOURCE_TYPES.SFTP })));
  persist();
}

function removeSource(index: number): void {
  rows.value.splice(index, 1);
  persist();
}

function move(index: number, offset: number): void {
  const target = index + offset;
  if (target < 0 || target >= rows.value.length) return;
  const [item] = rows.value.splice(index, 1);
  rows.value.splice(target, 0, item);
  persist();
}

function onTypeChange(row: MeltRow): void {
  if (row.type !== MELT_SOURCE_TYPES.UNPKG) row.version = '';
  persist();
}

function isOverridden(index: number): boolean {
  const row = rows.value[index];
  const name = String(row?.name || '').trim().toLowerCase();
  if (!name) return false;
  const bare = name.slice(name.lastIndexOf('/') + 1);
  return rows.value.some((other, otherIndex) => {
    if (otherIndex <= index || other.enabled === false) return false;
    const otherName = String(other.name || '').trim().toLowerCase();
    if (!otherName) return false;
    return otherName === name || otherName.slice(otherName.lastIndexOf('/') + 1) === bare;
  });
}

function refreshAll(): void {
  persist();
  refreshing.value = true;
  try {
    const deps = clearAllMeltCaches();
    window.dispatchEvent(new CustomEvent('coolma:melt-caches-cleared', { detail: { deps } }));
    ElMessage.success(t('settings.meltRefreshDone', { count: deps }));
  } finally {
    refreshing.value = false;
  }
}
</script>

<style scoped>
.melt-sources-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}

.melt-sources-hint {
  margin: 0 0 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.melt-source-card {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}

.melt-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.melt-source-row--second {
  margin-top: 8px;
}

.melt-name {
  flex: 1 1 220px;
}

.melt-type {
  width: 150px;
  flex: 0 0 auto;
}

.melt-base {
  flex: 1 1 220px;
}

.melt-version {
  width: 110px;
  flex: 0 0 auto;
}

.melt-dist {
  width: 110px;
  flex: 0 0 auto;
}

.melt-source-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.melt-source-preview-label {
  flex: 0 0 auto;
}

.melt-source-preview code {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.melt-source-preview code.is-empty,
.melt-source-warning {
  color: var(--el-color-danger);
}

.melt-source-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
}
</style>
