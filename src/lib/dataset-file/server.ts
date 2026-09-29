import "server-only";

import type { ColumnInput } from "@/lib/asset/schema";
import { requireUser } from "@/lib/profile/server";
import { createServiceClient } from "@/lib/supabase/service";

import {
  DATASET_FILES_BUCKET,
  filesToPurge,
  type DatasetFileFormat,
} from "./limits";
import { snapshotColumns } from "./schema";

type Person = { name: string | null; handle: string | null } | null;

export type DatasetFile = {
  id: string;
  version: number;
  filename: string;
  format: DatasetFileFormat;
  sizeBytes: number;
  rowCount: number | null;
  uploadedAt: string;
  purgedAt: string | null;
  uploader: Person;
};

export type SchemaVersion = {
  id: string;
  version: number;
  source: "manual" | "file";
  columns: ColumnInput[];
  createdAt: string;
  author: Person;
  file: { filename: string; version: number } | null;
};

const person = (
  p: { display_name: string | null; handle: string | null } | null,
): Person => (p ? { name: p.display_name, handle: p.handle } : null);

/** A dataset's file versions, newest first. */
export async function listDatasetFiles(
  assetId: string,
): Promise<DatasetFile[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("dataset_files")
    .select(
      "id, version, filename, format, size_bytes, row_count, uploaded_at, purged_at, profiles(display_name, handle)",
    )
    .eq("asset_id", assetId)
    .order("version", { ascending: false });
  if (error) throw new Error("Could not load the files.");
  return data.map((f) => ({
    id: f.id,
    version: f.version,
    filename: f.filename,
    format: f.format,
    sizeBytes: f.size_bytes,
    rowCount: f.row_count,
    uploadedAt: f.uploaded_at,
    purgedAt: f.purged_at,
    uploader: person(f.profiles),
  }));
}

/** A dataset's schema versions, newest first. */
export async function listSchemaVersions(
  assetId: string,
): Promise<SchemaVersion[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("dataset_schema_versions")
    .select(
      "id, version, source, columns, created_at, profiles(display_name, handle), dataset_files(filename, version)",
    )
    .eq("asset_id", assetId)
    .order("version", { ascending: false });
  if (error) throw new Error("Could not load the schema history.");
  return data.map((v) => ({
    id: v.id,
    version: v.version,
    source: v.source,
    columns: snapshotColumns(v.columns),
    createdAt: v.created_at,
    author: person(v.profiles),
    file: v.dataset_files,
  }));
}

// Service role below: every call is scoped by `workspaceId`.

/** Deletes stored objects beyond the newest versions. Logs, never throws. */
export async function purgeOldDatasetFiles(
  workspaceId: string,
  assetId: string,
): Promise<void> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("dataset_files")
    .select("id, version, storage_path, purged_at")
    .eq("workspace_id", workspaceId)
    .eq("asset_id", assetId);
  if (error) {
    console.error("dataset file retention: list failed", error);
    return;
  }
  const stale = filesToPurge(
    data.map((f) => ({ ...f, purgedAt: f.purged_at })),
  );
  if (!stale.length) return;
  const removed = await service.storage
    .from(DATASET_FILES_BUCKET)
    .remove(stale.map((f) => f.storage_path));
  if (removed.error) {
    console.error("dataset file retention: remove failed", removed.error);
    return;
  }
  const marked = await service
    .from("dataset_files")
    .update({ purged_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in(
      "id",
      stale.map((f) => f.id),
    );
  if (marked.error)
    console.error("dataset file retention: mark failed", marked.error);
}

/** Removes stored objects of a workspace (paths outside it are ignored). */
export async function removeStoredFiles(
  workspaceId: string,
  paths: string[],
): Promise<void> {
  const scoped = paths.filter((path) => path.startsWith(`${workspaceId}/`));
  if (!scoped.length) return;
  const { error } = await createServiceClient()
    .storage.from(DATASET_FILES_BUCKET)
    .remove(scoped);
  if (error) console.error("dataset file cleanup failed", error);
}
