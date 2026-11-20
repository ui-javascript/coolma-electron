import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppInfo, IpcResult } from '@shared/ipc/contract';
import type { BackupEntry, CategoryRecord, DatabaseStatus, EchoCard, ImportResult, IntegrityReport, NoteListResult, NoteRecord, PendingSyncSummary, RestoreResult, RuneCard, SyncLogEntry, TagRecord } from '@shared/types/domain';

export interface NoteListInput {
  query?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface NoteCreateInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  /** 笔记模板 id：主进程按「# 标题 + 模板正文」拼初始内容。 */
  templateId?: string;
}

export interface NoteTemplate {
  id: string;
  name: string;
  desc: string;
  content: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface NoteTemplateInput {
  id: string;
  name: string;
  desc?: string;
  content?: string;
  sortOrder?: number;
}

export interface NoteUpdateInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  dirty?: number;
}

export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export const hasIpc = (): boolean => Boolean(window.coolma);

/** 只读数据体检：返回差异报告，不做任何修复。 */
export const runDiagnostics = (): Promise<IpcResult<IntegrityReport>> =>
  invoke(IPC_CHANNELS.diagnostics.run);

/** 本地变更队列快照（outbox），后续同步引擎与设置页共用。 */
/** 符文卡片列表（@ 快捷面板的「符文」分组）。 */
export const listRunes = (): Promise<IpcResult<RuneCard[]>> => invoke(IPC_CHANNELS.library.runes);

/** 回响卡片列表（@ 快捷面板的「回响」分组）。 */
export const listEchoes = (): Promise<IpcResult<EchoCard[]>> => invoke(IPC_CHANNELS.library.echoes);

export interface RuneSavePayload {
  id: string;
  name: string;
  desc?: string;
  color?: string;
  icon?: string;
  template?: string;
  category?: string;
  sortOrder?: number;
  inheritFromPrevious?: number | boolean;
}

export interface EchoSavePayload {
  id: string;
  name: string;
  desc?: string;
  color?: string;
  icon?: string;
  annoSource?: string;
  renderType?: string;
  category?: string;
  sortOrder?: number;
}

/** 保存单个符文（upsert；同名返回 RUNE_DUPLICATE_NAME）。 */
export const saveRune = (payload: RuneSavePayload): Promise<IpcResult<RuneCard>> =>
  invoke(IPC_CHANNELS.library.runeSave, payload);

/** 批量保存符文：拖拽排序（skipDuplicates=false）或导入合并（true）。 */
export const saveRunes = (
  items: RuneSavePayload[],
  skipDuplicates = false,
): Promise<IpcResult<{ saved: number; skipped: number }>> =>
  invoke(IPC_CHANNELS.library.runeSaveMany, { items, skipDuplicates });

export const removeRune = (id: string): Promise<IpcResult<{ deleted: boolean }>> =>
  invoke(IPC_CHANNELS.library.runeRemove, { id });

/** 保存单个回响（upsert；同名返回 ECHO_DUPLICATE_NAME）。 */
export const saveEcho = (payload: EchoSavePayload): Promise<IpcResult<EchoCard>> =>
  invoke(IPC_CHANNELS.library.echoSave, payload);

export const saveEchoes = (
  items: EchoSavePayload[],
  skipDuplicates = false,
): Promise<IpcResult<{ saved: number; skipped: number }>> =>
  invoke(IPC_CHANNELS.library.echoSaveMany, { items, skipDuplicates });

export const removeEcho = (id: string): Promise<IpcResult<{ deleted: boolean }>> =>
  invoke(IPC_CHANNELS.library.echoRemove, { id });

export const getPendingSync = (): Promise<
  IpcResult<{ summary: PendingSyncSummary; items: SyncLogEntry[] }>
> => invoke(IPC_CHANNELS.sync.pending);

export async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  const api = window.coolma;
  if (!api) {
    return {
      ok: false,
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'Electron preload bridge is not available (browser preview).',
      },
    };
  }

  return api.invoke<T>(channel, payload);
}

export function getAppInfo(): Promise<IpcResult<AppInfo>> {
  return invoke<AppInfo>(IPC_CHANNELS.app.info);
}

export function getWindowState(): Promise<IpcResult<WindowState>> {
  return invoke<WindowState>(IPC_CHANNELS.window.state);
}

export function minimizeWindow(): Promise<IpcResult<null>> {
  return invoke<null>(IPC_CHANNELS.window.minimize);
}

export function toggleMaximizeWindow(): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.window.toggleMaximize);
}

export function closeWindow(): Promise<IpcResult<null>> {
  return invoke<null>(IPC_CHANNELS.window.close);
}

export function listNotes(input: NoteListInput = {}): Promise<IpcResult<NoteListResult>> {
  return invoke<NoteListResult>(IPC_CHANNELS.notes.list, input);
}

export function getNote(id: number): Promise<IpcResult<NoteRecord>> {
  return invoke<NoteRecord>(IPC_CHANNELS.notes.get, { id });
}

export function createNote(input: NoteCreateInput = {}): Promise<IpcResult<NoteRecord>> {
  return invoke<NoteRecord>(IPC_CHANNELS.notes.create, input);
}

export function updateNote(id: number, input: NoteUpdateInput): Promise<IpcResult<NoteRecord>> {
  return invoke<NoteRecord>(IPC_CHANNELS.notes.update, { id, ...input });
}

export function removeNote(id: number): Promise<IpcResult<{ deleted: boolean }>> {
  return invoke<{ deleted: boolean }>(IPC_CHANNELS.notes.remove, { id });
}

export function exportText(input: {
  content: string;
  fileName: string;
  fileType: 'html' | 'svg' | 'txt';
}): Promise<IpcResult<{ canceled: boolean; filePath: string }>> {
  return invoke<{ canceled: boolean; filePath: string }>(IPC_CHANNELS.notes.exportText, input);
}

export function exportNoteMarkdown(id: number): Promise<IpcResult<{ canceled: boolean; filePath: string }>> {
  return invoke<{ canceled: boolean; filePath: string }>(IPC_CHANNELS.notes.exportMarkdown, { id });
}

export function exportCategoryMarkdown(
  category: string,
): Promise<IpcResult<{ canceled: boolean; directory: string; written: number }>> {
  return invoke<{ canceled: boolean; directory: string; written: number }>(
    IPC_CHANNELS.notes.exportMarkdownFolder,
    { category, limit: 5000, offset: 0 },
  );
}

export interface SaveAttachmentInput {
  base64: string;
  ext?: string;
  kbGuid?: string | null;
  docGuid?: string | null;
  noteId?: number | null;
}

export function exportNotePng(
  id: number,
  dataUrl: string,
): Promise<IpcResult<{ canceled: boolean; filePath: string }>> {
  return invoke<{ canceled: boolean; filePath: string }>(IPC_CHANNELS.notes.exportPng, { id, dataUrl });
}

export function saveAttachmentImage(
  input: SaveAttachmentInput,
): Promise<IpcResult<{ url: string; filePath: string; name: string }>> {
  return invoke<{ url: string; filePath: string; name: string }>(IPC_CHANNELS.attachments.saveImage, input);
}

export type ImageUploadService = 'picgoServer' | 'wizOfficialImageUploadService' | 'none';

export interface UploadImageInput extends SaveAttachmentInput {
  name?: string;
  service: ImageUploadService;
}

export interface UploadImageResult {
  url: string;
  localUrl: string;
  uploaded: boolean;
  service: ImageUploadService;
  error?: string;
}

/** 贴图上传：主进程先本地落盘，再按图床服务上传；失败返回本地 url + error。 */
export function uploadImageAttachment(input: UploadImageInput): Promise<IpcResult<UploadImageResult>> {
  return invoke<UploadImageResult>(IPC_CHANNELS.attachments.uploadImage, input);
}

export function listCategories(): Promise<IpcResult<CategoryRecord[]>> {
  return invoke<CategoryRecord[]>(IPC_CHANNELS.categories.list);
}

export function createCategory(category: string, parent?: string): Promise<IpcResult<CategoryRecord>> {
  return invoke<CategoryRecord>(IPC_CHANNELS.categories.create, { category, parent });
}

export function removeCategory(category: string): Promise<IpcResult<{ deleted: boolean }>> {
  return invoke<{ deleted: boolean }>(IPC_CHANNELS.categories.remove, { category });
}

export function listTags(): Promise<IpcResult<TagRecord[]>> {
  return invoke<TagRecord[]>(IPC_CHANNELS.tags.list);
}

export function createTag(name: string, color?: string): Promise<IpcResult<TagRecord>> {
  return invoke<TagRecord>(IPC_CHANNELS.tags.create, { name, color });
}

export function syncTagIndex(): Promise<IpcResult<{ notes: number; links: number; tagsAdded: number }>> {
  return invoke<{ notes: number; links: number; tagsAdded: number }>(IPC_CHANNELS.tags.syncIndex);
}

export function removeTag(id: number): Promise<IpcResult<{ deleted: boolean }>> {
  return invoke<{ deleted: boolean }>(IPC_CHANNELS.tags.remove, { id });
}

export function getDatabaseStatus(): Promise<IpcResult<DatabaseStatus>> {
  return invoke<DatabaseStatus>(IPC_CHANNELS.database.status);
}

export function importLegacyDatabase(): Promise<IpcResult<ImportResult | null>> {
  return invoke<ImportResult | null>(IPC_CHANNELS.database.importLegacy, {});
}

export function listBackups(): Promise<IpcResult<BackupEntry[]>> {
  return invoke<BackupEntry[]>(IPC_CHANNELS.database.backups);
}

export function restoreDatabase(path?: string): Promise<IpcResult<RestoreResult | null>> {
  return invoke<RestoreResult | null>(IPC_CHANNELS.database.restore, path ? { path } : {});
}

export function backupDatabase(): Promise<IpcResult<{ path: string }>> {
  return invoke<{ path: string }>(IPC_CHANNELS.database.backup);
}

export function openDatabaseFolder(): Promise<IpcResult<{ opened: boolean }>> {
  return invoke<{ opened: boolean }>(IPC_CHANNELS.database.openFolder);
}

/** settings 表全量键值。 */
export function allSettings(): Promise<IpcResult<Record<string, unknown>>> {
  return invoke<Record<string, unknown>>(IPC_CHANNELS.settings.all);
}

export function setSetting(key: string, value: unknown): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.settings.set, { key, value });
}

export function listTemplates(): Promise<IpcResult<NoteTemplate[]>> {
  return invoke<NoteTemplate[]>(IPC_CHANNELS.templates.list);
}

export function saveTemplate(input: NoteTemplateInput): Promise<IpcResult<NoteTemplate>> {
  return invoke<NoteTemplate>(IPC_CHANNELS.templates.save, input);
}

export function removeTemplate(id: string): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.templates.remove, { id });
}

export interface PackPreviewGroup {
  previewAt: number;
  targetCategory: string;
  newItems: Array<{ index: number; name: string; selected: boolean }>;
  conflictItems: Array<{ index: number; name: string; selected: boolean }>;
  builtinBlocked: Array<{ index: number; name: string }>;
  invalidItems: Array<{ index: number; reason: string; name: string }>;
  dbNameCount: number;
}

export interface PackCommitResult {
  created: number;
  replaced: number;
  skipped: Array<{ name: string; reason: string }>;
}

export function previewPack(input: {
  kind: 'runes' | 'echoes';
  entries: Array<Record<string, unknown>>;
  targetCategory?: string;
}): Promise<IpcResult<PackPreviewGroup>> {
  return invoke<PackPreviewGroup>(IPC_CHANNELS.packs.preview, input);
}

export function commitPack(input: {
  kind: 'runes' | 'echoes';
  createNames: string[];
  replaceNames: string[];
  targetCategory?: string;
  previewAt: number;
  sourceByName: Record<string, Record<string, unknown>>;
}): Promise<IpcResult<PackCommitResult>> {
  return invoke<PackCommitResult>(IPC_CHANNELS.packs.commit, input);
}

export function fetchRemotePack(sourceUrl: string): Promise<IpcResult<{ text: string; finalUrl: string }>> {
  return invoke<{ text: string; finalUrl: string }>(IPC_CHANNELS.packs.fetchRemote, { sourceUrl });
}

export function exportPackFile(fileName: string, content: string): Promise<IpcResult<string>> {
  return invoke<string>(IPC_CHANNELS.packs.exportFile, { fileName, content });
}

export interface AiModelView {
  id: number;
  name: string;
  providerType: 'openai-compatible' | 'portkey';
  baseUrl: string;
  model: string;
  isDefault: boolean;
  enabled: boolean;
  headersJson: string;
  extraConfigJson: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  hasVirtualKey: boolean;
  virtualKeyMasked: string;
}

export interface AiModelSaveInput {
  id?: number;
  name: string;
  providerType: 'openai-compatible' | 'portkey';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  virtualKey?: string;
  clearVirtualKey?: boolean;
  isDefault?: boolean;
  enabled?: boolean;
  headersJson?: string;
  extraConfigJson?: string;
}

export interface AiSkill {
  id: number;
  name: string;
  title: string;
  content: string;
  builtin: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiSkillSaveInput {
  id?: number;
  name: string;
  title?: string;
  content?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export function listAiModels(): Promise<IpcResult<AiModelView[]>> {
  return invoke<AiModelView[]>(IPC_CHANNELS.ai.models);
}

export function saveAiModel(input: AiModelSaveInput): Promise<IpcResult<AiModelView>> {
  return invoke<AiModelView>(IPC_CHANNELS.ai.saveModel, input);
}

export function removeAiModel(id: number): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.ai.removeModel, { id });
}

export function setDefaultAiModel(id: number): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.ai.setDefaultModel, { id });
}

export function testAiModel(id: number): Promise<IpcResult<true>> {
  return invoke<true>(IPC_CHANNELS.ai.testModel, { id });
}

export function listAiSkills(): Promise<IpcResult<AiSkill[]>> {
  return invoke<AiSkill[]>(IPC_CHANNELS.ai.skills);
}

export function saveAiSkill(input: AiSkillSaveInput): Promise<IpcResult<AiSkill>> {
  return invoke<AiSkill>(IPC_CHANNELS.ai.saveSkill, input);
}

export function removeAiSkill(id: number): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.ai.removeSkill, { id });
}

export interface TagRenameResult {
  success: boolean;
  code?: string;
  name?: string;
}

export function renameTag(id: number, name: string): Promise<IpcResult<TagRenameResult>> {
  return invoke<TagRenameResult>(IPC_CHANNELS.tags.rename, { id, name });
}

export function removeTags(ids: number[]): Promise<IpcResult<{ deleted: number }>> {
  return invoke<{ deleted: number }>(IPC_CHANNELS.tags.removeMany, { ids });
}

export function cleanupUnusedTags(): Promise<IpcResult<{ deleted: number }>> {
  return invoke<{ deleted: number }>(IPC_CHANNELS.tags.cleanupUnused);
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatOutput {
  content: string;
  finishReason: string | null;
  truncated: boolean;
  model: string;
  usage: unknown;
}

export function aiChat(input: {
  modelId?: number;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<IpcResult<AiChatOutput>> {
  return invoke<AiChatOutput>(IPC_CHANNELS.ai.chat, input);
}
