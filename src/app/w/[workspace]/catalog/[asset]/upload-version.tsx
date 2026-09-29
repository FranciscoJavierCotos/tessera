"use client";

import { CircleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DatasetFilePicker } from "@/components/asset/dataset-file-picker";
import { UploadProgress } from "@/components/asset/upload-progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ColumnInput } from "@/lib/asset/schema";
import { summarizeFile } from "@/lib/dataset-file/format";
import type { ParsedDatasetFile } from "@/lib/dataset-file/parse";
import { mergeCarryOver } from "@/lib/dataset-file/schema-diff";

import { uploadDatasetFile } from "../upload-dataset-file";
import { SchemaReview } from "./schema-review";

/** Choose a file → review the schema change → upload it as the next version. */
export function UploadVersion({
  assetId,
  currentColumns,
}: {
  assetId: string;
  currentColumns: ColumnInput[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<ParsedDatasetFile | null>(null);
  const [columns, setColumns] = useState<ColumnInput[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress !== null;

  function reset() {
    setFile(null);
    setColumns([]);
    setProgress(null);
    setError(null);
  }

  async function confirm() {
    if (!file) return;
    setError(null);
    setProgress(0);
    const result = await uploadDatasetFile({
      assetId,
      parsed: file,
      columns,
      onProgress: setProgress,
    });
    setProgress(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(`Uploaded ${file.file.name}`);
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (uploading) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload aria-hidden />
          Upload new version
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload a new version</DialogTitle>
          <DialogDescription>
            The file becomes the dataset&apos;s current file and its columns
            replace the current ones. Descriptions and PII flags carry over by
            column name.
          </DialogDescription>
        </DialogHeader>

        {file ? (
          <>
            <p className="text-sm">
              {summarizeFile({
                filename: file.file.name,
                sizeBytes: file.file.size,
                rowCount: file.rowCount,
                columnCount: file.columns.length,
              })}
            </p>
            <SchemaReview
              current={currentColumns}
              proposed={columns}
              onChange={setColumns}
            />
          </>
        ) : (
          <DatasetFilePicker
            onParsed={(parsed) => {
              setFile(parsed);
              setColumns(mergeCarryOver(currentColumns, parsed.columns));
            }}
          />
        )}

        {uploading && file && (
          <UploadProgress
            value={progress}
            label={`Uploading ${file.file.name}…`}
          />
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>Could not upload the file</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {file && (
            <Button variant="ghost" disabled={uploading} onClick={reset}>
              Choose another file
            </Button>
          )}
          <Button onClick={confirm} disabled={!file || uploading}>
            {uploading ? "Uploading…" : "Confirm upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
