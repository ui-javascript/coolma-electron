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
