"use client";

import { FileUp } from "lucide-react";
import { useId, useState } from "react";

import { UploadProgress } from "@/components/asset/upload-progress";
import { Button } from "@/components/ui/button";
import { ACCEPT } from "@/lib/dataset-file/limits";
import {
  parseDatasetFile,
  type ParsedDatasetFile,
} from "@/lib/dataset-file/parse";
import { cn } from "@/lib/utils";

type Status =
  | { kind: "idle" }
  | { kind: "parsing"; progress: number }
  | { kind: "error"; message: string };

/** Drop zone + file button; reads the schema in the browser. */
export function DatasetFilePicker({
  onParsed,
  label = "Choose a CSV or Parquet file",
  disabled = false,
}: {
  onParsed: (parsed: ParsedDatasetFile) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const busy = disabled || status.kind === "parsing";

  async function read(file: File | undefined) {
    if (!file || busy) return;
    setStatus({ kind: "parsing", progress: 0 });
    const result = await parseDatasetFile(file, (progress) =>
      setStatus({ kind: "parsing", progress }),
    );
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "idle" });
    onParsed(result.parsed);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void read(event.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center",
        dragging && "border-primary bg-muted",
      )}
    >
      <FileUp aria-hidden className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Drop a file here, or</p>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        className="peer sr-only"
        disabled={busy}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button
        asChild
        variant="outline"
        size="sm"
        className="cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      >
        <label htmlFor={id}>{label}</label>
      </Button>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        CSV or Parquet, up to 50 MB. The file is read on your device first.
      </p>
      {status.kind === "parsing" && (
        <div className="w-full max-w-xs">
          <UploadProgress value={status.progress} label="Reading the file…" />
        </div>
      )}
      {status.kind === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      )}
    </div>
  );
}
