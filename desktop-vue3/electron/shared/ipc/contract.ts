export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  isDev: boolean;
  /** 豆包 WebApp 本地构建产物的 file:// 地址；未打包资源时为空。 */
  doubaoUrl: string;
}

export interface IpcError {
  code: string;
  message: string;
  details?: unknown;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

/**
 * The only API exposed to the renderer through `contextBridge`.
 * No raw ipcRenderer, require, or fs access is allowed.
 */
export interface CoolmaApi {
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<IpcResult<T>>;
  on(channel: string, listener: (payload: unknown) => void): () => void;
}
