import { History } from "lucide-react";

import { PiiBadge } from "@/components/asset/asset-badges";
import { SchemaDiffList } from "@/components/asset/schema-diff-list";
import { EmptyState } from "@/components/states/empty-state";
import { formatTimestamp } from "@/lib/dataset-file/format";
import { describeDiff, diffSchemas } from "@/lib/dataset-file/schema-diff";
import {
  listSchemaVersions,
  type SchemaVersion,
} from "@/lib/dataset-file/server";

const authorName = (v: SchemaVersion) =>
  v.author?.name ??
  (v.author?.handle ? `@${v.author.handle}` : "A former member");

export async function HistoryTab({ assetId }: { assetId: string }) {
  const versions = await listSchemaVersions(assetId);
  if (!versions.length) {
    return (
      <EmptyState
        icon={History}
        title="No schema history yet"
        description="Every change to the columns, typed by hand or from a file, is recorded here."
      />
    );
  }

  return (
    <ol aria-label="Schema versions" className="flex flex-col gap-3">
      {versions.map((version, index) => {
        const previous = versions[index + 1];
        const diff = diffSchemas(previous?.columns ?? [], version.columns);
        return (
          <li key={version.id} className="rounded-xl border">
            <details className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="font-medium">v{version.version}</span>
                <span className="text-sm">
                  {version.source === "file" ? (
                    <>
                      from file{" "}
                      <span className="font-mono">
                        {version.file?.filename ?? "a removed file"}
                      </span>
                    </>
                  ) : (
                    "manual edit"
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {describeDiff(diff, !previous, version.columns.length)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {authorName(version)} ·{" "}
                  <time dateTime={version.createdAt}>
                    {formatTimestamp(version.createdAt)}
                  </time>
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t px-4 py-3">
                {previous && <SchemaDiffList diff={diff} />}
                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    Columns in v{version.version}
                  </h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {version.columns.map((column) => (
                      <li
                        key={column.name}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span className="font-mono">{column.name}</span>
                        <span className="font-mono text-muted-foreground">
                          {column.dataType || "—"}
                        </span>
                        {column.isPii && <PiiBadge />}
                        {column.description && (
                          <span className="text-muted-foreground">
                            — {column.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
