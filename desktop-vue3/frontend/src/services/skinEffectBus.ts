/**
 * 换肤特效总线：皮肤卡（设置页）发信号，特效层（HomeView 常驻）接信号播动画。
 * 只传 skin 一种载荷，不引第三方事件库。
 */
import type { Skin } from '@/utils/skin';

type Listener = (skin: Skin) => void;

const listeners = new Set<Listener>();

export const skinEffectBus = {
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit(skin: Skin): void {
    for (const listener of listeners) {
      listener(skin);
    }
  },
};
