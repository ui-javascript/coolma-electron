<template>
  <el-dropdown class="skin-dropdown" trigger="click" @command="pickSkin">
    <span
      v-if="compact"
      class="header-icon-btn skin-compact-trigger"
      :title="t('settings.skin')"
      :aria-label="t('settings.skin')"
    >
      <q-icon v-if="compact" class="icon-custom" name="palette" />
      <el-icon v-else class="icon-custom"><Brush /></el-icon>
    </span>
    <el-button v-else circle plain :title="t('settings.skin')" :aria-label="t('settings.skin')">
      <el-icon><Brush /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="item in SKIN_MENU_ORDER" :key="item" :command="item">
          {{ skinName(item) }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Brush } from '@element-plus/icons-vue';
import { useSkinPick } from '@/composables/useSkinPick';
import type { Skin } from '@/utils/skin';

/**
 * 顶栏换肤下拉（复刻 vue2 HeaderRightGroup 的 `el-dropdown` + `handleSkinCommand`）。
 * 菜单顺序在 vue2 里就是 哪吒 → 白羊 → INFP，不跟设置页卡片顺序走。
 */
const SKIN_MENU_ORDER: Skin[] = ['nezha', 'baiyang', 'infp'];

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const { t } = useI18n();
const { pickSkin, skinName } = useSkinPick();
</script>

<style scoped>
.skin-compact-trigger {
  display: flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
}

.skin-compact-trigger:hover {
  background: var(--coolma-hover, rgb(0 0 0 / 4%));
}

.skin-compact-trigger .icon-custom {
  color: var(--coolma-muted, #6b737b);
  font-size: 18px;
  transition: all 0.2s ease;
}

.skin-compact-trigger:hover .icon-custom {
  color: var(--themeColor, #409eff);
}
</style>
