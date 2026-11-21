<template>
  <div class="skin-picker">
    <div class="skin-list">
      <button
        v-for="item in SKIN_LIST"
        :key="item"
        class="skin-item"
        :class="{ active: currentSkin === item }"
        type="button"
        @click="pickSkin(item)"
      >
        <span class="skin-swatch" :style="{ background: swatch(item) }" />
        <span class="skin-name">{{ skinName(item) }}</span>
        <span class="skin-desc">{{ t(`skin.${item}Desc`) }}</span>
        <el-icon v-if="currentSkin === item" class="skin-check"><Select /></el-icon>
      </button>
    </div>
    <p class="skin-hint">{{ t('settings.skinHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Select } from '@element-plus/icons-vue';
import { SKIN_COLORS, SKIN_LIST, type Skin } from '@/utils/skin';
import { useSkinPick } from '@/composables/useSkinPick';

/**
 * 皮肤选择卡（复刻 vue2 HeaderRightGroup 的换肤菜单 + skinMixin）。
 * 换肤动作与顶栏下拉共用 `useSkinPick`。
 */
const { t } = useI18n();
const { pickSkin, skinName, currentSkin } = useSkinPick();

function swatch(skin: Skin): string {
  return SKIN_COLORS[skin]?.main ?? 'linear-gradient(135deg,#409eff,#ffffff)';
}
</script>

<style scoped>
.skin-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skin-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 132px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s ease;
}

.skin-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.skin-item.active {
  border-color: var(--el-color-primary);
}

.skin-swatch {
  width: 100%;
  height: 14px;
  border-radius: 4px;
}

.skin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.skin-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.skin-check {
  position: absolute;
  right: 8px;
  top: 8px;
  color: var(--el-color-primary);
}

.skin-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
