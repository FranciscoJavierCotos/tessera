"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { getDatasetFileDownloadUrl } from "../dataset-file-actions";

export function DownloadFileButton({
  fileId,
  filename,
}: {
  fileId: string;
  filename: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-label={`Download ${filename}`}
      onClick={() =>
        startTransition(async () => {
          const result = await getDatasetFileDownloadUrl({ fileId });
          if (result.ok) window.location.assign(result.url);
          else toast.error(result.message);
        })
      }
    >
      <Download aria-hidden />
      Download
    </Button>
  );
}
