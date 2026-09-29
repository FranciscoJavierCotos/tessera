import { z } from "zod";

import { columnsSchema, type ColumnInput } from "@/lib/asset/schema";

import { DATASET_FILE_FORMATS, MAX_FILE_BYTES } from "./limits";

const filenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !name.includes("/"), {
    error: "File names cannot contain /.",
  });

export const prepareUploadSchema = z.object({
  assetId: z.uuid(),
  filename: filenameSchema,
  format: z.enum(DATASET_FILE_FORMATS),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(MAX_FILE_BYTES, { error: "Files can be at most 50 MB." }),
});

export const commitUploadSchema = z.object({
  assetId: z.uuid(),
  fileId: z.uuid(),
  path: z.string().min(1).max(1024),
  filename: filenameSchema,
  format: z.enum(DATASET_FILE_FORMATS),
  rowCount: z.number().int().min(0).nullable(),
  columns: columnsSchema,
});

export const fileRefSchema = z.object({ fileId: z.uuid() });

const snapshotColumn = z.object({
  name: z.string(),
  data_type: z.string().default(""),
  description: z.string().default(""),
  is_pii: z.boolean().default(false),
});

/** A `dataset_schema_versions.columns` value as column inputs. */
export function snapshotColumns(value: unknown): ColumnInput[] {
  const parsed = z.array(snapshotColumn).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((column) => ({
    name: column.name,
    dataType: column.data_type,
    description: column.description,
    isPii: column.is_pii,
  }));
}
