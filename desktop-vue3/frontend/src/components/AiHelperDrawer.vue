<template>
  <el-drawer v-model="visible" :title="t('aiHelper.title')" direction="rtl" size="420px" append-to-body>
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
