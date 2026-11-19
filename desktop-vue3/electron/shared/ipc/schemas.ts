import { z } from 'zod';

/** Payload for controller methods that accept no meaningful arguments. */
export const emptyPayloadSchema = z.union([
  z.undefined(),
  z.null(),
  z.object({}).strict(),
]);

export type EmptyPayload = z.infer<typeof emptyPayloadSchema>;

export const noteListSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    category: z.string().trim().max(500).optional(),
    tag: z.string().trim().max(100).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .default({});

export const notePngExportSchema = z.object({
  id: z.number().int().positive(),
  dataUrl: z.string().min(1).max(60_000_000),
});

export const noteIdSchema = z.object({
  id: z.number().int().positive(),
});

export const noteCreateSchema = z.object({
  title: z.string().trim().max(300).optional(),
  content: z.string().max(10_000_000).optional(),
  category: z.string().trim().max(500).optional(),
  tags: z.string().max(500).optional(),
  /** 笔记模板 id：给了就按「# 标题 + 模板正文」拼初始内容。 */
  templateId: z.string().trim().max(100).optional(),
});

export const packPreviewSchema = z.object({
  kind: z.enum(['runes', 'echoes']),
  entries: z.array(z.unknown()).max(500),
  targetCategory: z.string().trim().max(64).optional(),
});

export const packCommitSchema = z.object({
  kind: z.enum(['runes', 'echoes']),
  createNames: z.array(z.string().trim().min(1).max(100)).max(500),
  replaceNames: z.array(z.string().trim().min(1).max(100)).max(500),
  targetCategory: z.string().trim().max(64).optional(),
  previewAt: z.number().int().positive(),
  sourceByName: z.record(z.string(), z.unknown()),
});

export const packRemoteSchema = z.object({
  sourceUrl: z.string().trim().min(1).max(2000),
});

export const packExportSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  content: z.string().max(10_000_000),
});

export const noteTemplateSaveSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  desc: z.string().max(2000).optional(),
  content: z.string().max(200_000).optional(),
  isBuiltin: z.union([z.number(), z.boolean()]).optional(),
  sortOrder: z.number().int().optional(),
});

export const noteUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().trim().max(300).optional(),
    content: z.string().max(10_000_000).optional(),
    category: z.string().trim().max(500).optional(),
    tags: z.string().max(500).optional(),
    dirty: z.number().int().min(0).max(1).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.category !== undefined ||
      value.tags !== undefined ||
      value.dirty !== undefined,
    { message: 'At least one mutable field is required' },
  );

export const categoryCreateSchema = z.object({
  category: z.string().trim().min(1).max(500),
  parent: z.string().trim().max(500).optional(),
  kbGuid: z.string().max(200).optional(),
  localOnly: z.boolean().optional(),
});

export const categoryRemoveSchema = z.object({
  category: z.string().trim().min(1).max(500),
});

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const tagRemoveSchema = z.object({
  id: z.number().int().positive(),
});

export const settingsGetSchema = z.object({
  key: z.string().trim().min(1).max(200),
});

export const settingsSetSchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.unknown(),
});

export const databaseImportSchema = z
  .object({
    path: z.string().min(1).max(4096).optional(),
  })
  .default({});

export const databaseRestoreSchema = z
  .object({
    path: z.string().min(1).max(4096).optional(),
  })
  .default({});

export const runeSaveSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  desc: z.string().max(2000).optional(),
  color: z.string().trim().max(32).optional(),
  icon: z.string().trim().max(64).optional(),
  template: z.string().max(200_000).optional(),
  category: z.string().trim().max(64).optional(),
  sortOrder: z.number().int().optional(),
  inheritFromPrevious: z.union([z.number(), z.boolean()]).optional(),
});

export const echoSaveSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  desc: z.string().max(2000).optional(),
  color: z.string().trim().max(32).optional(),
  icon: z.string().trim().max(64).optional(),
  annoSource: z.string().max(200_000).optional(),
  renderType: z.string().trim().max(32).optional(),
  category: z.string().trim().max(64).optional(),
  sortOrder: z.number().int().optional(),
});

export const libraryRemoveSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export const librarySaveManySchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())).max(2000).default([]),
  skipDuplicates: z.boolean().optional(),
});
