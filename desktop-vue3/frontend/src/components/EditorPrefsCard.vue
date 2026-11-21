<template>
  <el-form label-width="150px" label-position="left">
    <el-form-item :label="t('settings.editorMarkdownOnly')">
      <el-switch v-model="markdownOnly" @change="save('editor.markdownOnly', $event)" />
      <span class="pref-hint">{{ t('settings.editorMarkdownOnlyHint') }}</span>
    </el-form-item>
    <el-form-item :label="t('settings.editorDenseMode')">
      <el-switch v-model="denseMode" @change="save('editor.noteListDenseMode', $event)" />
      <span class="pref-hint">{{ t('settings.editorDenseModeHint') }}</span>
    </el-form-item>
    <el-form-item :label="t('settings.editorNoteOrder')">
      <el-select v-model="noteOrder" class="order-select" @change="save('editor.noteOrderType', $event)">
        <el-option v-for="item in orderItems" :key="item.value" :label="t(item.label)" :value="item.value" />
      </el-select>
    </el-form-item>
    <el-form-item :label="t('settings.editorQuickInsertColumns')">
      <el-slider v-model="quickColumns" :min="4" :max="8" :step="1" show-input class="columns-slider" @change="save('editor.quickInsertColumns', $event)" />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NoteOrderTypeEnum } from '@shared/enums/app';
import { useAppStore } from '@/stores/app';

/**
 * 编辑器偏好（复刻 vue2 SettingsEditorPanel 的 note/panel 两个子 Tab）。
 * 持久化走 settings 表（settings.set 通道），键名对齐 vue2 client state：
 * editor.markdownOnly / editor.noteListDenseMode / editor.noteOrderType / editor.quickInsertColumns。
 */
const { t } = useI18n();
const appStore = useAppStore();

const markdownOnly = ref(false);
const denseMode = ref(false);
const noteOrder = ref<string>(NoteOrderTypeEnum.TitleAsc);
const quickColumns = ref(6);

const orderItems = NoteOrderTypeEnum.items as Array<{ value: string; label: string }>;

onMounted(() => {
  const prefs = appStore.prefs;
  markdownOnly.value = prefs['editor.markdownOnly'] === true;
  denseMode.value = prefs['editor.noteListDenseMode'] === true;
  const order = prefs['editor.noteOrderType'];
  if (typeof order === 'string' && NoteOrderTypeEnum.has(order)) {
    noteOrder.value = order;
  }
  const cols = Number(prefs['editor.quickInsertColumns']);
  if (Number.isFinite(cols)) {
    quickColumns.value = Math.min(8, Math.max(4, cols));
  }
});

function save(key: string, value: unknown): void {
  appStore.setPref(key, value);
}
</script>

<style scoped>
.pref-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.order-select {
  width: 240px;
}

.columns-slider {
  width: 280px;
}
</style>
