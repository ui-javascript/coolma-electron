import { defineStore } from 'pinia';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { listEchoes, listRunes } from '@/services/ipc';

/**
 * 符文/回响缓存。
 *
 * @ 快捷面板每次打开都会调 provider，provider 里只读内存缓存，不在按键路径上发 IPC；
 * 数据变化（新增/删除卡片）时再显式 reload。
 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    runes: [] as RuneCard[],
    echoes: [] as EchoCard[],
    loading: false,
    loaded: false,
    error: '',
  }),

  actions: {
    async load(force = false): Promise<boolean> {
      if (this.loading || (this.loaded && !force)) {
        return this.loaded;
      }

      this.loading = true;
      try {
        const [runesResult, echoesResult] = await Promise.all([listRunes(), listEchoes()]);
        if (!runesResult.ok || !echoesResult.ok) {
          this.error = !runesResult.ok ? runesResult.error.message : (!echoesResult.ok ? echoesResult.error.message : '');
          return false;
        }
        this.runes = runesResult.data;
        this.echoes = echoesResult.data;
        this.loaded = true;
        this.error = '';
        return true;
      } finally {
        this.loading = false;
      }
    },
  },
});
