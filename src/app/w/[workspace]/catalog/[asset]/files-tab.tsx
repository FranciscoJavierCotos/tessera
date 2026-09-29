import { FileUp } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnInput } from "@/lib/asset/schema";
import { formatBytes, formatTimestamp } from "@/lib/dataset-file/format";
import { listDatasetFiles, type DatasetFile } from "@/lib/dataset-file/server";

import { DownloadFileButton } from "./download-file-button";
import { UploadVersion } from "./upload-version";

const uploaderName = (file: DatasetFile) =>
  file.uploader?.name ??
  (file.uploader?.handle ? `@${file.uploader.handle}` : "A former member");

export async function FilesTab({
  assetId,
  canEdit,
  currentColumns,
}: {
  assetId: string;
  canEdit: boolean;
  currentColumns: ColumnInput[];
}) {
  const files = await listDatasetFiles(assetId);
  const upload = canEdit ? (
    <UploadVersion assetId={assetId} currentColumns={currentColumns} />
  ) : null;

  if (!files.length) {
    return (
      <EmptyState
        icon={FileUp}
        title="No file attached"
        description="Upload a CSV or Parquet file to fill the schema automatically."
        action={upload}
      />
    );
  }
  const [current, ...previous] = files as [DatasetFile, ...DatasetFile[]];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="current-file-heading"
        className="flex flex-col gap-3 rounded-xl border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="current-file-heading" className="text-base font-semibold">
            Current file
          </h2>
          {upload}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-sm">{current.filename}</p>
            <p className="text-sm text-muted-foreground">
              v{current.version} · {current.format.toUpperCase()} ·{" "}
              {formatBytes(current.sizeBytes)}
              {current.rowCount !== null &&
                ` · ${current.rowCount.toLocaleString("en-US")} rows`}{" "}
              · {uploaderName(current)} ·{" "}
              <time dateTime={current.uploadedAt}>
                {formatTimestamp(current.uploadedAt)}
              </time>
            </p>
          </div>
          <DownloadFileButton fileId={current.id} filename={current.filename} />
        </div>
      </section>

      {previous.length > 0 && (
        <section
          aria-labelledby="previous-files-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="previous-files-heading" className="text-base font-semibold">
            Previous versions
          </h2>
          <div className="rounded-xl border">
            <Table>
              <TableCaption className="sr-only">
                Previous file versions
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 px-3">Version</TableHead>
                  <TableHead className="px-3">File</TableHead>
                  <TableHead className="px-3">Size</TableHead>
                  <TableHead className="px-3">Uploaded</TableHead>
                  <TableHead className="px-3">
                    <span className="sr-only">Download</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previous.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="px-3">v{file.version}</TableCell>
                    <TableCell className="px-3 font-mono">
                      {file.filename}
                    </TableCell>
                    <TableCell className="px-3">
                      {formatBytes(file.sizeBytes)}
                    </TableCell>
                    <TableCell className="px-3">
                      {uploaderName(file)} ·{" "}
                      <time dateTime={file.uploadedAt}>
                        {formatTimestamp(file.uploadedAt)}
                      </time>
                    </TableCell>
                    <TableCell className="px-3 text-right">
                      {file.purgedAt ? (
                        <span className="text-sm text-muted-foreground">
                          File removed (retention)
                        </span>
                      ) : (
                        <DownloadFileButton
                          fileId={file.id}
                          filename={file.filename}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
