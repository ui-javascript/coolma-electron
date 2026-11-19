<template>
  <div class="auto-tag">
    <div class="auto-tag-model" :class="modelUsable ? 'is-ready' : 'is-missing'">
      <span v-if="modelUsable">{{ t('aiAutoTagModelReady', { model: modelLabel }) }}</span>
      <span v-else>{{ t('aiAutoTagModelMissing') }}</span>
    </div>

    <div class="auto-tag-params">
      <el-form inline size="small">
        <el-form-item :label="t('aiAutoTagMaxTags')">
          <el-input-number v-model="maxTagsPerNote" :min="1" :max="8" :disabled="busy" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('aiAutoTagRunLimit')">
          <el-input-number v-model="runLimit" :min="1" :max="200" :disabled="busy" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('aiAutoTagConcurrency')">
          <el-input-number v-model="concurrency" :min="1" :max="8" :disabled="busy" controls-position="right" />
        </el-form-item>
      </el-form>
      <p class="auto-tag-hint">{{ t('aiAutoTagHint') }}</p>
    </div>

    <div class="auto-tag-actions">
      <el-button text size="small" :loading="loading" :disabled="busy" @click="refresh">{{ t('aiAutoTagRefresh') }}</el-button>
      <el-button
        text
        size="small"
        type="primary"
        :loading="running"
        :disabled="!canGenerate"
        @click="runTagging"
      >
        {{ t('aiAutoTagGenerate') }}
      </el-button>
      <el-button text size="small" type="success" :disabled="!hasPending || busy" @click="applyAll">
        {{ t('aiAutoTagApplyAll') }}
      </el-button>
      <span class="auto-tag-gap" />
      <span class="auto-tag-count">{{ t('aiAutoTagSelectedCount', { selected: selectedCount, total: rows.length }) }}</span>
      <el-checkbox
        :model-value="allSelected"
        size="small"
        :disabled="busy || rows.length === 0"
        @change="toggleSelectAll"
      >
        {{ t('aiAutoTagSelectAll') }}
      </el-checkbox>
    </div>

    <div v-if="running" class="auto-tag-progress">
      <el-progress :percentage="progressRatio" :stroke-width="6" />
      <span class="auto-tag-progress-text">
        {{ t('aiAutoTagProgress', { done: progress.done, total: progress.total, title: currentTitle }) }}
      </span>
    </div>

    <div v-if="loading" class="auto-tag-empty">{{ t('aiAutoTagScanning') }}</div>
    <div v-else-if="rows.length === 0" class="auto-tag-empty">
      {{ t('aiAutoTagEmpty') }}
      <div class="auto-tag-empty-hint">{{ t('aiAutoTagEmptyHint') }}</div>
    </div>
    <div v-else class="auto-tag-list">
      <div v-for="row in rows" :key="row.id" class="auto-tag-row">
        <el-checkbox
          v-model="row.selected"
          size="small"
          :disabled="busy || row.status === 'applied'"
        />
        <div class="auto-tag-body">
          <div class="auto-tag-title-line">
            <span class="auto-tag-title">{{ row.title }}</span>
            <el-tag v-if="row.status !== 'idle'" size="small" :type="statusType(row.status)" effect="plain">
              {{ statusLabel(row.status) }}
            </el-tag>
          </div>
          <div class="auto-tag-preview">{{ row.preview || '—' }}</div>
          <div v-if="row.names.length" class="auto-tag-tags">
            <el-tag
              v-for="(name, index) in row.names"
              :key="name"
              size="small"
              closable
              :type="row.reusedNames.includes(name) ? 'success' : 'info'"
              effect="plain"
              @close="removeName(row, index)"
            >
              {{ name }}
            </el-tag>
          </div>
          <div v-if="row.error" class="auto-tag-error">{{ row.error }}</div>
        </div>
        <el-button
          text
          size="small"
          :disabled="row.names.length === 0 || row.status === 'applied' || busy"
          @click="applyRow(row, false)"
        >
          {{ t('aiAutoTagApplyOne') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { NoteSummary, TagRecord } from '@shared/types/domain';
import {
  aiChat,
  createTag,
  getNote,
  listAiModels,
  listNotes,
  listTags,
  updateNote,
  type AiChatMessage,
  type AiChatOutput,
} from '@/services/ipc';
import {
  DEFAULT_MAX_TOKENS,
  RETRY_MAX_TOKENS,
  buildAutoTagMessages,
  filterUntaggedNotes,
  parseTagNames,
} from '@/utils/autotag';

/**
 * AI 打标（复刻 vue2 SettingsAiAutoTagPanel）。
 *
 * 分工对齐 vue2：主进程只出 chat 结果（Key 不出主进程），
 * 候选筛选 / 并发 / 应用标签都在渲染层，纯函数在 utils/autotag.ts。
 */
const { t } = useI18n();

type RowStatus = 'idle' | 'running' | 'ready' | 'failed' | 'applied';

interface Row {
  id: number;
  title: string;
  preview: string;
  selected: boolean;
  names: string[];
  reusedNames: string[];
  status: RowStatus;
  error: string;
}

const rows = ref<Row[]>([]);
const loading = ref(false);
const running = ref(false);
const applyRunning = ref(false);
const maxTagsPerNote = ref(3);
const runLimit = ref(20);
const concurrency = ref(2);
const progress = ref({ done: 0, total: 0 });
const currentTitle = ref('');
const modelLabel = ref('');
const modelUsable = ref(false);
const tagPool = ref<TagRecord[]>([]);
const stats = ref({ appliedNotes: 0, reused: 0, created: 0 });

const busy = computed(() => running.value || applyRunning.value);
const canGenerate = computed(() => modelUsable.value && !busy.value && rows.value.length > 0);
const selectedCount = computed(() => rows.value.filter((row) => row.selected && row.status !== 'applied').length);
const allSelected = computed(() => rows.value.length > 0 && rows.value.every((row) => row.selected || row.status === 'applied'));
const hasPending = computed(() => rows.value.some((row) => row.names.length > 0 && row.status !== 'applied'));
const progressRatio = computed(() =>
  progress.value.total > 0 ? Math.round((progress.value.done / progress.value.total) * 100) : 0,
);

onMounted(refresh);

async function refresh(): Promise<void> {
  stats.value = { appliedNotes: 0, reused: 0, created: 0 };
  await Promise.all([loadModelStatus(), loadTagPool(), loadCandidates()]);
}

async function loadModelStatus(): Promise<void> {
  const result = await listAiModels();
  if (!result.ok) {
    modelUsable.value = false;
    return;
  }
  const usable = result.data.find((item) => item.isDefault && item.enabled) ?? result.data.find((item) => item.enabled);
  modelUsable.value = Boolean(usable && usable.hasApiKey && usable.baseUrl && usable.model);
  modelLabel.value = usable ? `${usable.name} · ${usable.model}` : '';
}

async function loadTagPool(): Promise<void> {
  const result = await listTags();
  tagPool.value = result.ok ? result.data : [];
}

async function loadCandidates(): Promise<void> {
  loading.value = true;
  try {
    const result = await listNotes({ limit: 500, offset: 0 });
    const items: NoteSummary[] = result.ok ? result.data.items : [];
    rows.value = filterUntaggedNotes(items).map((note) => ({
      id: note.id,
      title: note.title || t('note.untitled'),
      preview: note.excerpt || '',
      selected: true,
      names: [],
      reusedNames: [],
      status: 'idle' as RowStatus,
      error: '',
    }));
  } finally {
    loading.value = false;
  }
}

function toggleSelectAll(value: boolean | string | number): void {
  const checked = Boolean(value);
  for (const row of rows.value) {
    if (row.status !== 'applied') {
      row.selected = checked;
    }
  }
}

function statusType(status: RowStatus): 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'applied') {
    return 'success';
  }
  if (status === 'ready') {
    return 'success';
  }
  if (status === 'failed') {
    return 'danger';
  }
  if (status === 'running') {
    return 'warning';
  }
  return 'info';
}

function statusLabel(status: RowStatus): string {
  return t(`aiAutoTagStatus.${status}`);
}

function describeError(code: string | undefined, message: string): string {
  if (code === 'AI_TAG_NO_DEFAULT_CONFIG') {
    return t('aiAutoTagNoConfig');
  }
  if (code === 'AI_TAG_CONFIG_INCOMPLETE') {
    return t('aiAutoTagConfigIncomplete');
  }
  return message || t('aiAutoTagGenerateFailed');
}

/** 单次打标：调主进程 chat，截断且空内容时放大预算重试一次（对齐 vue2）。 */
async function suggestOne(row: Row): Promise<{ names: string[]; truncated: boolean }> {
  const messages = buildAutoTagMessages({
    title: row.title,
    content: row.preview,
    existingTagNames: tagPool.value.map((tag) => tag.name),
    maxTags: maxTagsPerNote.value,
  }) as AiChatMessage[];

  const call = async (maxTokens: number): Promise<AiChatOutput> => {
    const result = await aiChat({ messages, temperature: 0.2, maxTokens });
    if (!result.ok) {
      const error = new Error(result.error.message) as Error & { code?: string };
      error.code = result.error.code;
      throw error;
    }
    return result.data;
  };

  let attempt = await call(DEFAULT_MAX_TOKENS);
  let names = parseTagNames(attempt.content, { maxTags: maxTagsPerNote.value });
  if (names.length === 0 && !attempt.content.trim() && attempt.truncated) {
    attempt = await call(Math.max(DEFAULT_MAX_TOKENS * 2, RETRY_MAX_TOKENS));
    names = parseTagNames(attempt.content, { maxTags: maxTagsPerNote.value });
  }
  return { names, truncated: attempt.truncated };
}

async function runTagging(): Promise<void> {
  if (busy.value) {
    return;
  }
  if (!modelUsable.value) {
    ElMessage.warning(t('aiAutoTagNoConfig'));
    return;
  }
  const batch = rows.value
    .filter((row) => row.selected && row.status !== 'applied' && row.status !== 'running')
    .slice(0, runLimit.value);
  if (batch.length === 0) {
    ElMessage.warning(t('aiAutoTagNothingSelected'));
    return;
  }

  await loadTagPool();
  running.value = true;
  progress.value = { done: 0, total: batch.length };
  let readyCount = 0;
  let failedCount = 0;
  let cursor = 0;

  const processOne = async (row: Row): Promise<void> => {
    row.status = 'running';
    currentTitle.value = row.title;
    try {
      // 候选来自摘要，正文要单独取（vue2 也是 notes.getById 拿 content）
      const detail = await getNote(row.id);
      const content = detail.ok ? detail.data.content : row.preview;
      const { names, truncated } = await suggestOne({ ...row, preview: content });
      if (names.length === 0) {
        row.status = 'failed';
        row.error = truncated ? t('aiAutoTagTruncated') : t('aiAutoTagNoResult');
        failedCount += 1;
      } else {
        row.names = names;
        row.reusedNames = names.filter((name) =>
          tagPool.value.some((tag) => tag.name.toLowerCase() === name.toLowerCase()),
        );
        row.status = 'ready';
        row.error = '';
        readyCount += 1;
      }
    } catch (error) {
      const typed = error as Error & { code?: string };
      row.status = 'failed';
      row.error = describeError(typed.code, typed.message);
      failedCount += 1;
    } finally {
      progress.value.done += 1;
    }
  };

  const worker = async (): Promise<void> => {
    while (cursor < batch.length) {
      const index = cursor;
      cursor += 1;
      await processOne(batch[index]);
    }
  };

  try {
    const workers = Math.max(1, Math.min(concurrency.value, batch.length));
    await Promise.all(Array.from({ length: workers }, () => worker()));
  } finally {
    running.value = false;
    currentTitle.value = '';
  }

  ElMessage({
    message: t('aiAutoTagRunDone', { ready: readyCount, failed: failedCount }),
    type: failedCount > 0 && readyCount === 0 ? 'warning' : 'success',
  });
}

function removeName(row: Row, index: number): void {
  row.names.splice(index, 1);
}

/**
 * 应用标签：先用已有标签（同名大小写无关），缺的现场建，
 * 最后把 notes.tags 字符串整体写回（字符串是权威，note_tags 由主进程重建）。
 */
async function applyRow(row: Row, silent: boolean): Promise<boolean> {
  if (applyRunning.value || row.names.length === 0) {
    return false;
  }
  applyRunning.value = true;
  try {
    const existing = new Map<string, TagRecord>();
    for (const tag of tagPool.value) {
      existing.set(tag.name.toLowerCase(), tag);
    }
    const finalNames: string[] = [];
    let reused = 0;
    let created = 0;
    for (const name of row.names) {
      const key = name.toLowerCase();
      const hit = existing.get(key);
      if (hit) {
        // 复用已有标签的原始写法（大小写按库里为准）
        finalNames.push(hit.name);
        reused += 1;
        continue;
      }
      const result = await createTag(name);
      if (!result.ok) {
        continue;
      }
      existing.set(key, result.data);
      tagPool.value.push(result.data);
      finalNames.push(name);
      created += 1;
    }
    if (finalNames.length === 0) {
      row.status = 'failed';
      row.error = t('aiAutoTagApplyFailed');
      return false;
    }

    const detail = await getNote(row.id);
    const oldTags = detail.ok ? detail.data.tags : '';
    const merged = Array.from(
      new Set(
        [...oldTags.split(','), ...finalNames]
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    );
    const saved = await updateNote(row.id, { tags: merged.join(',') });
    if (!saved.ok) {
      row.status = 'failed';
      row.error = t('aiAutoTagApplyFailed');
      return false;
    }

    row.status = 'applied';
    row.reusedNames = row.names.filter((name) => tagPool.value.some((tag) => tag.name.toLowerCase() === name.toLowerCase()));
    row.error = '';
    stats.value.reused += reused;
    stats.value.created += created;
    stats.value.appliedNotes += 1;
    if (!silent) {
      ElMessage.success(t('aiAutoTagAppliedOne', { title: row.title, count: finalNames.length }));
    }
    return true;
  } catch (error) {
    row.status = 'failed';
    row.error = (error as Error)?.message || t('aiAutoTagApplyFailed');
    return false;
  } finally {
    applyRunning.value = false;
  }
}

async function applyAll(): Promise<void> {
  if (busy.value) {
    return;
  }
  const pending = rows.value.filter((row) => row.names.length > 0 && row.status !== 'applied' && row.status !== 'running');
  if (pending.length === 0) {
    return;
  }
  let applied = 0;
  for (const row of pending) {
    if (await applyRow(row, true)) {
      applied += 1;
    }
  }
  ElMessage.success(t('aiAutoTagAppliedAll', { count: applied }));
}
</script>

<style scoped>
.auto-tag-model {
  font-size: 12px;
  padding: 4px 0;
}

.auto-tag-model.is-ready {
  color: var(--el-color-success);
}

.auto-tag-model.is-missing {
  color: var(--el-color-warning);
}

.auto-tag-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.auto-tag-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.auto-tag-gap {
  flex: 1;
}

.auto-tag-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.auto-tag-progress {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auto-tag-progress-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.auto-tag-list {
  margin-top: 6px;
  max-height: 420px;
  overflow: auto;
}

.auto-tag-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.auto-tag-body {
  flex: 1;
  min-width: 0;
}

.auto-tag-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.auto-tag-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-tag-preview {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-tag-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.auto-tag-error {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.auto-tag-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.auto-tag-empty-hint {
  margin-top: 4px;
  color: var(--el-text-color-placeholder);
}
</style>
