"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { columnsPayload } from "@/lib/asset/schema";
import {
  CONTENT_TYPES,
  DATASET_FILES_BUCKET,
  storagePath,
} from "@/lib/dataset-file/limits";
import {
  commitUploadSchema,
  fileRefSchema,
  prepareUploadSchema,
} from "@/lib/dataset-file/schema";
import { purgeOldDatasetFiles } from "@/lib/dataset-file/server";
import { requireUser } from "@/lib/profile/server";

import type { ActionResult } from "./actions";

const GENERIC_ERROR = "Something went wrong. Try again.";
const NOT_ALLOWED =
  "You do not have permission to upload files to this dataset.";
const DOWNLOAD_TTL_SECONDS = 60;

export type PreparedUpload = {
  fileId: string;
  path: string;
  signedUrl: string;
  contentType: string;
};

/** A signed URL the browser uploads the file to (Storage RLS applies). */
export async function prepareDatasetFileUpload(
  raw: unknown,
): Promise<
  { ok: true; upload: PreparedUpload } | { ok: false; message: string }
> {
  const input = prepareUploadSchema.safeParse(raw);
  if (!input.success) {
    return {
      ok: false,
      message: input.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }
  const { supabase } = await requireUser();
  const { data: asset } = await supabase
    .from("assets")
    .select("workspace_id, kind")
    .eq("id", input.data.assetId)
    .maybeSingle();
  if (!asset || asset.kind !== "dataset")
    return { ok: false, message: NOT_ALLOWED };

  const fileId = randomUUID();
  const path = storagePath(
    asset.workspace_id,
    input.data.assetId,
    fileId,
    input.data.filename,
  );
  const { data, error } = await supabase.storage
    .from(DATASET_FILES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: NOT_ALLOWED };
  return {
    ok: true,
    upload: {
      fileId,
      path,
      signedUrl: data.signedUrl,
      contentType: CONTENT_TYPES[input.data.format],
    },
  };
}

/** Records an uploaded file as the dataset's next version and applies its columns. */
export async function commitDatasetFile(raw: unknown): Promise<ActionResult> {
  const input = commitUploadSchema.safeParse(raw);
  if (!input.success) {
    return {
      ok: false,
      message: input.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("add_dataset_file", {
    asset: input.data.assetId,
    file_id: input.data.fileId,
    storage_path: input.data.path,
    filename: input.data.filename,
    format: input.data.format,
    columns: columnsPayload(input.data.columns),
    row_count: input.data.rowCount ?? undefined,
  });
  if (error?.code === "P0002") {
    return { ok: false, message: "The upload did not finish. Try again." };
  }
  if (error?.code === "42501") return { ok: false, message: NOT_ALLOWED };
  if (error?.code === "21000" || error?.code === "23505") {
    return { ok: false, message: "Column names must be unique." };
  }
  if (error || !data) return { ok: false, message: GENERIC_ERROR };

  await purgeOldDatasetFiles(data.workspace_id, data.asset_id);
  revalidatePath("/w/[workspace]/catalog", "layout");
  return { ok: true };
}

/** A short-lived download link that saves the file under its original name. */
export async function getDatasetFileDownloadUrl(
  raw: unknown,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const input = fileRefSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("dataset_files")
    .select("storage_path, filename, purged_at")
    .eq("id", input.data.fileId)
    .maybeSingle();
  if (!data || data.purged_at) {
    return { ok: false, message: "This file is no longer available." };
  }
  const signed = await supabase.storage
    .from(DATASET_FILES_BUCKET)
    .createSignedUrl(data.storage_path, DOWNLOAD_TTL_SECONDS, {
      download: data.filename,
    });
  if (signed.error || !signed.data)
    return { ok: false, message: GENERIC_ERROR };
  return { ok: true, url: signed.data.signedUrl };
}
