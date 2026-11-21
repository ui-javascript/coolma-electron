<template>
  <el-dropdown class="skin-dropdown" trigger="click" @command="pickSkin">
    <el-button circle plain :title="t('settings.skin')" :aria-label="t('settings.skin')">
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

const { t } = useI18n();
const { pickSkin, skinName } = useSkinPick();
</script>
