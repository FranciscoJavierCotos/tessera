import type { ColumnInput } from "@/lib/asset/schema";

export type MetaChange = "renamed" | "description" | "pii";

export type SchemaDiff = {
  added: ColumnInput[];
  removed: ColumnInput[];
  typeChanged: { name: string; before: string; after: string }[];
  metaChanged: { name: string; changes: MetaChange[] }[];
  unchanged: ColumnInput[];
};

// Column names are unique case-insensitively (citext in the database).
const key = (name: string) => name.trim().toLowerCase();

/** How `after` differs from `before`, in `after`'s order (removed in `before`'s). */
export function diffSchemas(
  before: ColumnInput[],
  after: ColumnInput[],
): SchemaDiff {
  const previous = new Map(before.map((column) => [key(column.name), column]));
  const next = new Set(after.map((column) => key(column.name)));
  const diff: SchemaDiff = {
    added: [],
    removed: [],
    typeChanged: [],
    metaChanged: [],
    unchanged: [],
  };

  for (const column of after) {
    const old = previous.get(key(column.name));
    if (!old) {
      diff.added.push(column);
      continue;
    }
    const changes: MetaChange[] = [];
    if (old.name !== column.name) changes.push("renamed");
    if (old.description !== column.description) changes.push("description");
    if (old.isPii !== column.isPii) changes.push("pii");
    const retyped = old.dataType !== column.dataType;
    if (retyped) {
      diff.typeChanged.push({
        name: column.name,
        before: old.dataType,
        after: column.dataType,
      });
    }
    if (changes.length) diff.metaChanged.push({ name: column.name, changes });
    if (!retyped && !changes.length) diff.unchanged.push(column);
  }
  diff.removed = before.filter((column) => !next.has(key(column.name)));
  return diff;
}

export function hasChanges(diff: SchemaDiff): boolean {
  return Boolean(
    diff.added.length ||
    diff.removed.length ||
    diff.typeChanged.length ||
    diff.metaChanged.length,
  );
}

/**
 * The file's columns (names and types) with the descriptions and PII flags of
 * the current columns of the same name.
 */
export function mergeCarryOver(
  current: ColumnInput[],
  parsed: ColumnInput[],
): ColumnInput[] {
  const byName = new Map(current.map((column) => [key(column.name), column]));
  return parsed.map((column) => {
    const old = byName.get(key(column.name));
    return {
      name: column.name,
      dataType: column.dataType,
      description: old?.description ?? column.description,
      isPii: old?.isPii ?? column.isPii,
    };
  });
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** One line for a schema version: `1 added · 1 removed · 1 type change`. */
export function describeDiff(
  diff: SchemaDiff,
  isFirst: boolean,
  columnCount: number,
): string {
  if (isFirst)
    return `Initial schema · ${plural(columnCount, "column", "columns")}`;
  const parts = [
    diff.added.length ? `${diff.added.length} added` : null,
    diff.removed.length ? `${diff.removed.length} removed` : null,
    diff.typeChanged.length
      ? plural(diff.typeChanged.length, "type change", "type changes")
      : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  if (diff.metaChanged.length) {
    return `${plural(diff.metaChanged.length, "column", "columns")} documented`;
  }
  return "No changes";
}
