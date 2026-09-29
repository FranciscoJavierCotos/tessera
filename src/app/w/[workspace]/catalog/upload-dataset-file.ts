import type { ColumnInput } from "@/lib/asset/schema";
import type { ParsedDatasetFile } from "@/lib/dataset-file/parse";
import { putFile } from "@/lib/dataset-file/upload";

import type { ActionResult } from "./actions";
import {
  commitDatasetFile,
  prepareDatasetFileUpload,
} from "./dataset-file-actions";

/** Prepare → upload straight to Storage → record the version with `columns`. */
export async function uploadDatasetFile({
  assetId,
  parsed,
  columns,
  onProgress,
}: {
  assetId: string;
  parsed: ParsedDatasetFile;
  columns: ColumnInput[];
  onProgress?: (fraction: number) => void;
}): Promise<ActionResult> {
  const prepared = await prepareDatasetFileUpload({
    assetId,
    filename: parsed.file.name,
    format: parsed.format,
    sizeBytes: parsed.file.size,
  });
  if (!prepared.ok) return prepared;
  try {
    await putFile(
      prepared.upload.signedUrl,
      parsed.file,
      prepared.upload.contentType,
      onProgress,
    );
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The upload failed.",
    };
  }
  return commitDatasetFile({
    assetId,
    fileId: prepared.upload.fileId,
    path: prepared.upload.path,
    filename: parsed.file.name,
    format: parsed.format,
    rowCount: parsed.rowCount,
    columns,
  });
}
