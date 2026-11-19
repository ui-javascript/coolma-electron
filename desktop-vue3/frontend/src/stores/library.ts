import { defineStore } from 'pinia';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import {
  listEchoes,
  listRunes,
  removeEcho,
  removeRune,
  saveEcho,
  saveEchoes,
  saveRune,
  saveRunes,
  type EchoSavePayload,
  type RuneSavePayload,
} from '@/services/ipc';

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
    /** 保存单个符文（upsert），成功后刷新缓存并返回卡片。 */
    async saveRuneCard(payload: RuneSavePayload): Promise<RuneCard | null> {
      const result = await saveRune(payload);
      if (result.ok === false) {
        this.error = result.error.message;
        return null;
      }
      await this.load(true);
      return result.data;
    },

    /** 批量保存符文（拖拽排序）。 */
    async saveRuneOrder(payloads: RuneSavePayload[]): Promise<boolean> {
      const result = await saveRunes(payloads);
      if (result.ok === false) {
        this.error = result.error.message;
        return false;
      }
      await this.load(true);
      return true;
    },

    async deleteRuneCard(id: string): Promise<boolean> {
      const result = await removeRune(id);
      if (result.ok === false) {
        this.error = result.error.message;
        return false;
      }
      await this.load(true);
      return true;
    },

    async saveEchoCard(payload: EchoSavePayload): Promise<EchoCard | null> {
      const result = await saveEcho(payload);
      if (result.ok === false) {
        this.error = result.error.message;
        return null;
      }
      await this.load(true);
      return result.data;
    },

    /** 批量保存回响（拖拽排序）。 */
    async saveEchoOrder(payloads: EchoSavePayload[]): Promise<boolean> {
      const result = await saveEchoes(payloads);
      if (result.ok === false) {
        this.error = result.error.message;
        return false;
      }
      await this.load(true);
      return true;
    },

    async deleteEchoCard(id: string): Promise<boolean> {
      const result = await removeEcho(id);
      if (result.ok === false) {
        this.error = result.error.message;
        return false;
      }
      await this.load(true);
      return true;
    },

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
