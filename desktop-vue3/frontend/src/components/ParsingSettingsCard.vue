<template>
  <div class="parsing-settings">
    <div class="parsing-row">
      <div class="parsing-row-text">
        <div class="parsing-row-title">
          {{ t('editorParsingEchoTitle') }}
          <span class="parsing-row-syntax">(@xxx{...}(prompt))</span>
        </div>
        <div class="parsing-row-hint">{{ t('editorParsingEchoRequireParensHint') }}</div>
      </div>
      <el-radio-group v-model="echoRequireParens" size="small" @change="saveEcho">
        <el-radio-button :value="true">{{ t('yes') }}</el-radio-button>
        <el-radio-button :value="false">{{ t('no') }}</el-radio-button>
      </el-radio-group>
    </div>

    <el-divider />

    <div class="parsing-row">
      <div class="parsing-row-text">
        <div class="parsing-row-title">
          {{ t('editorParsingRuneTitle') }}
          <span class="parsing-row-syntax">&lt;template&gt; → &lt;div&gt;</span>
        </div>
        <div class="parsing-row-hint">{{ t('editorParsingRuneRequireTemplateDivHint') }}</div>
      </div>
      <el-radio-group v-model="runeRequireTemplateDiv" size="small" @change="saveRuneDiv">
        <el-radio-button :value="true">{{ t('yes') }}</el-radio-button>
        <el-radio-button :value="false">{{ t('no') }}</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/stores/app';

/**
 * 解析设置（复刻 vue2 SettingsParsingPanel）：
 * - 回响括号必填：改 settings 表 + 调引擎 setEchoAnnoRule 运行时改写规则（无需重建编辑器）；
 * - 符文模板 div：改 settings 表 + 供符文表单校验读取。
 */
const { t } = useI18n();
const appStore = useAppStore();

const echoRequireParens = ref(true);
const runeRequireTemplateDiv = ref(false);

onMounted(() => {
  const prefs = appStore.prefs;
  echoRequireParens.value = prefs['parsing.echoRequireParens'] !== false;
  runeRequireTemplateDiv.value = prefs['parsing.runeRequireTemplateDiv'] === true;
  void applyEchoRule(echoRequireParens.value);
});

async function saveEcho(value: boolean | string | number | undefined): Promise<void> {
  await appStore.setPref('parsing.echoRequireParens', Boolean(value));
  await applyEchoRule(Boolean(value));
}

/** 引擎侧：运行时改写 inlineRules.echo_anno，不用重建 Muya。 */
async function applyEchoRule(requireParens: boolean): Promise<void> {
  try {
    const { setEchoAnnoRule } = await import('libs-muya-vue3');
    setEchoAnnoRule({ requireParens });
  } catch {
    // 引擎未加载（如 SSR/测试环境）时静默跳过
  }
}

async function saveRuneDiv(value: boolean | string | number | undefined): Promise<void> {
  await appStore.setPref('parsing.runeRequireTemplateDiv', Boolean(value));
}
</script>

<style scoped>
.parsing-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 2px;
}

.parsing-row-text {
  flex: 1 1 auto;
  min-width: 0;
}

.parsing-row-title {
  font-weight: 600;
  font-size: 13px;
}

.parsing-row-syntax {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.parsing-row-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
