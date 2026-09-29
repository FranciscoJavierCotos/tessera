import type { MetaChange, SchemaDiff } from "@/lib/dataset-file/schema-diff";

const META_LABELS: Record<MetaChange, string> = {
  renamed: "renamed",
  description: "description changed",
  pii: "PII flag changed",
};

/** Added, removed, retyped and re-documented columns of a schema change. */
export function SchemaDiffList({
  diff,
  warnOnLoss = false,
}: {
  diff: SchemaDiff;
  warnOnLoss?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1 font-mono text-sm">
      {diff.added.map((c) => (
        <li
          key={`+${c.name}`}
          className="text-emerald-700 dark:text-emerald-400"
        >
          + {c.name} <span className="text-muted-foreground">{c.dataType}</span>
        </li>
      ))}
      {diff.removed.map((c) => (
        <li key={`-${c.name}`} className="text-destructive">
          − {c.name}
          {warnOnLoss && (c.description || c.isPii) && (
            <span className="font-sans text-muted-foreground">
              {" "}
              — its{" "}
              {[c.description && "description", c.isPii && "PII flag"]
                .filter(Boolean)
                .join(" and ")}{" "}
              will be lost
            </span>
          )}
        </li>
      ))}
      {diff.typeChanged.map((c) => (
        <li key={`~${c.name}`}>
          ~ {c.name}: <span>{`${c.before || "—"} → ${c.after || "—"}`}</span>
        </li>
      ))}
      {diff.metaChanged.map((c) => (
        <li key={`*${c.name}`} className="text-muted-foreground">
          * {c.name}:{" "}
          <span className="font-sans">
            {c.changes.map((k) => META_LABELS[k]).join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
