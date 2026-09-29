/** Formats a dataset file can have (mirrors enum `dataset_file_format`). */
export const DATASET_FILE_FORMATS = ["csv", "parquet"] as const;
export type DatasetFileFormat = (typeof DATASET_FILE_FORMATS)[number];

/** Supabase Free plan upload cap (mirrors the bucket's `file_size_limit`). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Stored files kept per dataset; older ones are purged from Storage. */
export const KEEP_FILE_VERSIONS = 10;
export const DATASET_FILES_BUCKET = "dataset-files";
/** For `<input accept>`. */
export const ACCEPT = ".csv,.parquet";

/** Sent as the upload's content type (the bucket only allows these). */
export const CONTENT_TYPES: Record<DatasetFileFormat, string> = {
  csv: "text/csv",
  parquet: "application/vnd.apache.parquet",
};

export function formatFromFilename(name: string): DatasetFileFormat | null {
  const extension = /\.([^.]+)$/.exec(name.toLowerCase())?.[1];
  return DATASET_FILE_FORMATS.find((f) => f === extension) ?? null;
}

/** `orders.v2.csv` → `orders.v2`. */
export function fileStem(name: string): string {
  return name.replace(/\.[^.]*$/, "") || name;
}

const MAX_OBJECT_NAME = 100;

/** An ASCII-only object key segment; keeps the end (the extension) when long. */
export function safeObjectName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/_(?=\.)/g, "");
  // Keep the end (the extension); the key must start with a letter or digit
  // (the `dataset_files_storage_path_canonical` check).
  const trimmed = cleaned
    .slice(-MAX_OBJECT_NAME)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/_+$/, "");
  return trimmed || "file";
}

export function storagePath(
  workspaceId: string,
  assetId: string,
  fileId: string,
  filename: string,
): string {
  return `${workspaceId}/${assetId}/${fileId}/${safeObjectName(filename)}`;
}

export type FileCheck =
  { ok: true; format: DatasetFileFormat } | { ok: false; message: string };

export function checkFile(file: { name: string; size: number }): FileCheck {
  const format = formatFromFilename(file.name);
  if (!format) return { ok: false, message: "Choose a .csv or .parquet file." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: "Files can be at most 50 MB." };
  }
  return { ok: true, format };
}

/** Stored (not yet purged) files beyond the newest `keep` versions. */
export function filesToPurge<
  T extends { version: number; purgedAt: string | null },
>(files: T[], keep: number = KEEP_FILE_VERSIONS): T[] {
  return [...files]
    .sort((a, b) => b.version - a.version)
    .slice(keep)
    .filter((file) => !file.purgedAt);
}
