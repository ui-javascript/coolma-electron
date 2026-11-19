<template>
  <el-dialog v-model="visible" :title="t(kind === 'runes' ? 'library.exportRunes' : 'library.exportEchoes')"
    width="min(480px, 92vw)" append-to-body :before-close="closeWhenIdle">
    <p class="export-count">{{ t('library.exportCount', { count: cards.length }) }}</p>
    <ul class="export-preview">
      <li v-for="card in cards.slice(0, previewLimit)" :key="card.id">
        <span class="card-dot" :style="{ background: card.color }"></span>
        {{ card.name }} <span class="export-category">({{ card.category }})</span>
      </li>
      <li v-if="cards.length > previewLimit">{{ t('library.exportMore', { count: cards.length - previewLimit }) }}</li>
    </ul>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template #footer>
      <el-button :disabled="exporting" @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" :loading="exporting" :disabled="!cards.length" @click="savePack">{{ t('pack.export') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { exportPackFile } from '@/services/ipc';
import { buildPack, type PackKind } from '@/services/pack';

const props = defineProps<{ kind: PackKind; cards: ReadonlyArray<RuneCard | EchoCard> }>();
const visible = defineModel<boolean>({ required: true });
const { t } = useI18n();
const previewLimit = 10;
const exporting = ref(false);
const error = ref('');

watch(visible, (open) => { if (open) error.value = ''; });

function closeWhenIdle(done: () => void): void {
  if (!exporting.value) done();
}

async function savePack(): Promise<void> {
  if (!props.cards.length || exporting.value) return;
  exporting.value = true;
  error.value = '';
  try {
    const content = buildPack(props.kind, props.cards);
    const fileName = `coolma-${props.kind}-pack-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await exportPackFile(fileName, content);
    if (!result.ok) {
      error.value = result.error.message;
    } else if (result.data) {
      ElMessage.success(t('pack.exported', { path: result.data }));
      visible.value = false;
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.export-count { margin: 0 0 10px; }
.export-preview {
  max-height: 180px;
  overflow: auto;
  list-style: none;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.export-preview li { padding: 2px 0; }
.card-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 4px;
  border-radius: 50%;
}
.export-category { color: var(--el-text-color-secondary); }
</style>
