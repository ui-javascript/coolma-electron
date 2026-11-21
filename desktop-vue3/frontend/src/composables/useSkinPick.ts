/**
 * 换肤动作（复刻 vue2 HeaderRightGroup.handleSkinCommand + skinMixin）。
 *
 * 顺序与 vue2 一致：同皮只提示不重播；换皮先落 localStorage/CSS 变量，
 * 再发特效信号，最后 toast。设置页皮肤卡与顶栏下拉共用这一套，避免两处走偏。
 */
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/stores/app';
import { skinEffectBus } from '@/services/skinEffectBus';
import { normalizeSkinSelection, skinLabelKey, type Skin } from '@/utils/skin';

export function useSkinPick() {
  const { t } = useI18n();
  const appStore = useAppStore();

  function skinName(skin: Skin): string {
    return t(skinLabelKey(skin));
  }

  /** command 来自 el-dropdown，可能是字符串/数字/对象；归一规则与 vue2 相同。 */
  function pickSkin(command: unknown): void {
    const nextSkin = normalizeSkinSelection(command);
    const name = skinName(nextSkin);

    if (appStore.skin === nextSkin) {
      ElMessage({
        message: t('settings.skinSwitched', { name }),
        type: 'info',
      });
      return;
    }

    appStore.setSkin(nextSkin);
    skinEffectBus.emit(nextSkin);
    ElMessage({
      message: t('settings.skinSwitched', { name }),
      type: 'success',
      // 配色对齐 vue2 SKIN_NOTIFY_COLORS；全局样式在 styles/index.css。
      customClass: `skin-notify skin-notify-${nextSkin}`,
    });
  }

  return { pickSkin, skinName, currentSkin: computed(() => appStore.skin) };
}
