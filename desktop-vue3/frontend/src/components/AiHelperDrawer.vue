<template>
  <el-drawer
    v-model="visible"
    :title="t('aiHelper.title')"
    direction="rtl"
    size="420px"
    class="ai-demo-drawer"
    :modal="false"
    :z-index="9999"
    :wrapper-closable="false"
    :close-on-press-escape="false"
    append-to-body
  >
    <AiHelperPanel :note-id="noteId" />
  </el-drawer>
</template>

<script setup lang="ts">
/** AI 助手抽屉外壳：与 AiHelperBusDialog 共用同一个对话面板。 */
import { useI18n } from 'vue-i18n';
import AiHelperPanel from '@/components/AiHelperPanel.vue';

const visible = defineModel<boolean>({ default: false });
defineProps<{ noteId?: number | null }>();
const { t } = useI18n();
</script>

<style>
.ai-demo-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 14px 16px;
  border-bottom: 1px solid var(--coolma-border, #ebeef5);
  color: var(--coolma-text, #303133);
  font-weight: 700;
}

.ai-demo-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
</style>
