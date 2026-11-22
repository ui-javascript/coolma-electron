import { defineStore } from 'pinia';
import { getPendingSync } from '@/services/ipc';
import { getSyncConflicts, getSyncStatus, resolveSyncConflicts, syncPull, syncPush, type PushResult, type PullResult } from '@/services/sync';
import type { SyncConflictRecord, SyncConflictResolution } from '@shared/types/domain';
import { useNotesStore } from '@/stores/notes';
import {
  AUTO_UPLOAD_KICKOFF_DELAY,
  AUTO_UPLOAD_POLL_INTERVAL,
  AUTO_UPLOAD_RETRY_COOLDOWN,
  shouldAutoUpload,
} from '@/utils/syncAuto';

let kickoffTimer: ReturnType<typeof setTimeout> | undefined;
let intervalTimer: ReturnType<typeof setInterval> | undefined;
let cooldownUntil = 0;
let started = false;

export const useSyncStore = defineStore('sync', {
  state: () => ({
    loggedIn: false,
    pendingTotal: 0,
    pendingCreate: 0,
    pendingUpdate: 0,
    pendingDelete: 0,
    lastSyncAt: undefined as number | undefined,
    isSyncing: false,
    busyKind: '' as '' | 'push' | 'pull',
    lastError: '',
    conflicts: [] as SyncConflictRecord[],
  }),

  actions: {
    async refreshConflicts(): Promise<number> {
      try {
        const result = await getSyncConflicts();
        if (!result.ok) {
          this.lastError = result.error.message;
          return this.conflicts.length;
        }
        this.conflicts = result.data.items;
        return result.data.total;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        return this.conflicts.length;
      }
    },

    async resolveConflicts(resolutions: Array<{ noteId: number; resolution: SyncConflictResolution }>): Promise<number> {
      if (!resolutions.length) return this.conflicts.length;
      const result = await resolveSyncConflicts(resolutions);
      if (!result.ok) {
        this.lastError = result.error.message;
        return this.conflicts.length;
      }
      const handled = new Set(resolutions.map((item) => item.noteId));
      this.conflicts = this.conflicts.filter((item) => !handled.has(item.noteId));
      return result.data.remaining;
    },

    setLoggedIn(value: boolean): void {
      this.loggedIn = value;
      if (!value) {
        this.pendingTotal = 0;
        this.pendingCreate = 0;
        this.pendingUpdate = 0;
        this.pendingDelete = 0;
      }
    },

    async refreshStatus(): Promise<boolean> {
      try {
        const result = await getSyncStatus();
        if (!result.ok) {
          this.setLoggedIn(false);
          this.lastError = result.error.message;
          return false;
        }
        this.setLoggedIn(result.data.loggedIn);
        this.lastSyncAt = result.data.lastSyncAt;
        return result.data.loggedIn;
      } catch (error) {
        this.setLoggedIn(false);
        this.lastError = error instanceof Error ? error.message : String(error);
        return false;
      }
    },

    async refreshPending(): Promise<number | null> {
      try {
        const result = await getPendingSync();
        if (!result.ok) {
          this.lastError = result.error.message;
          return null;
        }
        this.pendingTotal = result.data.summary.total ?? 0;
        this.pendingCreate = result.data.summary.create ?? 0;
        this.pendingUpdate = result.data.summary.update ?? 0;
        this.pendingDelete = result.data.summary.delete ?? 0;
        return this.pendingTotal;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        return null;
      }
    },

    async push(limit = 50): Promise<PushResult | null> {
      if (!this.loggedIn || this.isSyncing) {
        return null;
      }
      this.isSyncing = true;
      this.busyKind = 'push';
      this.lastError = '';
      try {
        const result = await syncPush({ limit });
        if (!result.ok) {
          this.lastError = result.error.message;
          return null;
        }
        if (result.data.errors.length) {
          this.lastError = result.data.errors.join('\n');
        }
        this.lastSyncAt = Date.now();
        cooldownUntil = 0;
        await this.refreshPending();
        await useNotesStore().loadAll();
        return result.data;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        return null;
      } finally {
        this.isSyncing = false;
        this.busyKind = '';
      }
    },

    async pull(limit = 200): Promise<PullResult | null> {
      if (!this.loggedIn || this.isSyncing) {
        return null;
      }
      this.isSyncing = true;
      this.busyKind = 'pull';
      this.lastError = '';
      try {
        const result = await syncPull({ limit });
        if (!result.ok) {
          this.lastError = result.error.message;
          return null;
        }
        if (result.data.errors.length) {
          this.lastError = result.data.errors.join('\n');
        }
        this.lastSyncAt = Date.now();
        cooldownUntil = 0;
        await this.refreshPending();
        await useNotesStore().loadAll();
        return result.data;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        return null;
      } finally {
        this.isSyncing = false;
        this.busyKind = '';
      }
    },

    /** 自动上传：登录、在线、有待同步、无冷却时才推；失败进入 5 分钟冷却。 */
    async autoUploadTick(): Promise<void> {
      if (this.isSyncing) {
        return;
      }
      if (!this.loggedIn) {
        await this.refreshStatus();
      }
      if (!this.loggedIn || this.isSyncing) {
        return;
      }

      // 先刷角标：即使处于冷却期或离线，pending 数字也要保持实时。
      const pending = await this.refreshPending();
      if (pending === null || this.isSyncing) {
        return;
      }
      if (!shouldAutoUpload({
        loggedIn: this.loggedIn,
        isSyncing: this.isSyncing,
        pendingTotal: this.pendingTotal,
        cooldownUntil,
        now: Date.now(),
        online: typeof navigator === 'undefined' || navigator.onLine !== false,
      })) {
        return;
      }

      const result = await this.push();
      if (!result || result.failed > 0 || result.errors.length) {
        cooldownUntil = Date.now() + AUTO_UPLOAD_RETRY_COOLDOWN;
      }
    },

    startAutoUpload(): void {
      if (started) {
        return;
      }
      started = true;
      kickoffTimer = setTimeout(() => {
        kickoffTimer = undefined;
        void this.autoUploadTick();
      }, AUTO_UPLOAD_KICKOFF_DELAY);
      intervalTimer = setInterval(() => {
        void this.autoUploadTick();
      }, AUTO_UPLOAD_POLL_INTERVAL);
    },

    stopAutoUpload(): void {
      if (kickoffTimer) {
        clearTimeout(kickoffTimer);
        kickoffTimer = undefined;
      }
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = undefined;
      }
      started = false;
    },
  },
});
