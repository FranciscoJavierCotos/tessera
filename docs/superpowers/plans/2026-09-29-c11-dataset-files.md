# C11 — Dataset files & schema history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a CSV or Parquet file to a dataset (stored in Supabase Storage), read its schema in the browser into the dataset's columns, keep every file version (10 newest stored) and a schema history of every column change (file or manual).

**Architecture:** The browser parses the file (`hyparquet` reads the Parquet footer; `papaparse` streams CSV in chunks), a server action returns a signed upload URL, the browser PUTs the file straight to the private `dataset-files` bucket, and a second server action calls the `add_dataset_file` RPC, which records the file version and applies the columns through `set_dataset_columns`; that function now snapshots the schema into `dataset_schema_versions` whenever the columns change. Retention and asset deletion remove stored objects with the service-role client, scoped by workspace.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres 17, Storage, RLS), Zod 4, `hyparquet` 1.31, `papaparse` 5.7, `hyparquet-writer` 0.16 (tests only), Vitest 5 + RTL, Playwright.

**Spec:** `docs/specs/c11-dataset-files.md`

## Global Constraints

- Branch `feat/<issue>-dataset-files`; Conventional Commits with scope `catalog` or `db`; never push to `main`. No `Co-Authored-By` and no "Generated with Claude" lines anywhere.
- Max file size **50 MB** (`52428800` bytes); keep the **10** newest stored files per dataset; schema snapshots are never deleted.
- Accepted formats: `.csv` and `.parquet` only (extension check, case-insensitive). Upload content types: `text/csv` and `application/vnd.apache.parquet` exactly.
- Object path: `{workspace_id}/{asset_id}/{file_id}/{safe filename}`, safe filename = `[A-Za-z0-9._-]` only.
- RLS is the gate: every new table has RLS enabled in the same migration, policies, and tests (cross-workspace denial, viewer denial). Security-definer functions live in `private`, `set search_path = ''`, fully-qualified names.
- The service-role client is only used through helpers that take a `workspaceId` and scope every call by it.
- Migrations only via `supabase/migrations`; apply to the cloud project (`pnpm db:push` or Supabase MCP `apply_migration` then match the file's version); regenerate `src/lib/db/types.ts` with `pnpm db:types`; `pnpm db:lint` clean; `get_advisors` security clean.
- Zod validates every server-action input. UI has empty, loading and error states, keyboard access and dark mode (use design tokens: `text-muted-foreground`, `border`, `bg-muted`, `text-destructive`).
- Column limits reuse `src/lib/asset/schema.ts`: `MAX_COLUMNS = 500`, `MAX_COLUMN_NAME = 255`, `MAX_COLUMN_TYPE = 100`.
- Tests run under `TZ=UTC`. Env vars only through `@/env`.
- Before the PR: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build`, plus `pnpm test:db` and `pnpm test:e2e`.

## Review Focus

- **Excel-style CSV exports** (UTF-8 BOM, `;` delimiter, `\r\n` line endings, quoted fields with commas): the header must come out clean (no `﻿`), delimiter detected, types inferred. → Task 3 test "handles a BOM, semicolons and CRLF".
- **Filenames with spaces, accents or unicode** (`Ventas 2026 – ñ.csv`): the object key must be a safe ASCII name while the original name is kept for display and download. → Task 1 test for `safeObjectName` and Task 6 test that `filename` is stored verbatim.
- **Uploading a file whose schema equals the current one**: a new file version, but **no** new schema version. → Task 6 test "identical schema adds no snapshot".
- **Columns whose names differ only by case** (`Amount` vs `amount`): same column; descriptions/PII carry over, no spurious added/removed pair. → Task 2 tests for `diffSchemas` and `mergeCarryOver`.
- **Header-only CSV or codes with leading zeros** (`zip` = `02134`): 0 rows is valid and yields `STRING` columns; leading-zero numbers stay `STRING`. → Task 3 tests.

---

## File Structure

| File                                                             | Responsibility                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib/dataset-file/limits.ts`                                 | Constants, format detection, safe object names, storage path, `checkFile`, `filesToPurge` |
| `src/lib/dataset-file/format.ts`                                 | `formatBytes`, `summarizeFile`, `formatTimestamp` (display only)                          |
| `src/lib/dataset-file/types.ts`                                  | `ParsedSchema`, `DatasetFileError`, `validateColumnNames`                                 |
| `src/lib/dataset-file/parse-csv.ts`                              | CSV → schema (streaming builder + type inference)                                         |
| `src/lib/dataset-file/parse-parquet.ts`                          | Parquet footer → schema (readable type names)                                             |
| `src/lib/dataset-file/parse.ts`                                  | `parseDatasetFile(file)`: check + dispatch, returns a result object                       |
| `src/lib/dataset-file/schema-diff.ts`                            | `diffSchemas`, `hasChanges`, `mergeCarryOver`, `describeDiff`                             |
| `src/lib/dataset-file/schema.ts`                                 | Zod schemas for the actions, `snapshotColumns`                                            |
| `src/lib/dataset-file/server.ts`                                 | Reads (files, schema versions) + service-role `purgeOldDatasetFiles`, `removeStoredFiles` |
| `src/lib/dataset-file/upload.ts`                                 | `putFile` (XHR PUT with progress)                                                         |
| `supabase/migrations/<ts>_dataset_files.sql`                     | Enums, bucket, tables, RLS, trigger, functions, backfill                                  |
| `tests/db/dataset-files.test.ts`                                 | RLS + function tests against the cloud project                                            |
| `src/app/w/[workspace]/catalog/dataset-file-actions.ts`          | Server actions: prepare, commit, download URL                                             |
| `src/app/w/[workspace]/catalog/upload-dataset-file.ts`           | Client orchestration prepare → put → commit                                               |
| `src/components/asset/dataset-file-picker.tsx`                   | Drop zone / file button, parse state, errors                                              |
| `src/components/asset/upload-progress.tsx`                       | Accessible progress bar                                                                   |
| `src/components/asset/schema-diff-list.tsx`                      | Renders a `SchemaDiff` (added / removed / type / meta)                                    |
| `src/app/w/[workspace]/catalog/asset-form.tsx` (modify)          | New dataset from a file                                                                   |
| `src/app/w/[workspace]/catalog/actions.ts` (modify)              | `createAsset` "created" state; `deleteAsset` removes stored files                         |
| `src/app/w/[workspace]/catalog/[asset]/schema-review.tsx`        | Diff + editable description/PII of the proposed columns                                   |
| `src/app/w/[workspace]/catalog/[asset]/upload-version.tsx`       | "Upload new version" dialog flow                                                          |
| `src/app/w/[workspace]/catalog/[asset]/files-tab.tsx`            | Current file + previous versions                                                          |
| `src/app/w/[workspace]/catalog/[asset]/download-file-button.tsx` | Signed-URL download                                                                       |
| `src/app/w/[workspace]/catalog/[asset]/history-tab.tsx`          | Schema version timeline                                                                   |
| `src/app/w/[workspace]/catalog/[asset]/page.tsx` (modify)        | Files + History tabs, upload on Columns tab                                               |
| `tests/e2e/dataset-files.spec.ts`                                | End-to-end flow                                                                           |

---

### Task 1: Dependencies, limits and display helpers

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/lib/dataset-file/limits.ts`, `src/lib/dataset-file/format.ts`
- Test: `src/lib/dataset-file/limits.test.ts`, `src/lib/dataset-file/format.test.ts`

**Interfaces:**

- Produces: `DATASET_FILE_FORMATS`, `type DatasetFileFormat = "csv" | "parquet"`, `MAX_FILE_BYTES`, `KEEP_FILE_VERSIONS`, `DATASET_FILES_BUCKET = "dataset-files"`, `ACCEPT = ".csv,.parquet"`, `CONTENT_TYPES: Record<DatasetFileFormat, string>`, `formatFromFilename(name): DatasetFileFormat | null`, `fileStem(name): string`, `safeObjectName(name): string`, `storagePath(workspaceId, assetId, fileId, filename): string`, `checkFile({name,size}): {ok:true; format} | {ok:false; message}`, `filesToPurge<T extends {version:number; purgedAt:string|null}>(files: T[], keep?): T[]`; `formatBytes(bytes): string`, `summarizeFile({filename,sizeBytes,rowCount,columnCount}): string`, `formatTimestamp(iso): string`.

- [ ] **Step 1: Install dependencies (check latest stable first)**

```bash
npm view hyparquet version; npm view papaparse version; npm view hyparquet-writer version
pnpm add hyparquet papaparse
pnpm add -D @types/papaparse hyparquet-writer
```

- [ ] **Step 2: Write the failing tests**

`src/lib/dataset-file/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  checkFile,
  fileStem,
  filesToPurge,
  formatFromFilename,
  MAX_FILE_BYTES,
  safeObjectName,
  storagePath,
} from "./limits";

describe("formatFromFilename", () => {
  it("detects csv and parquet case-insensitively", () => {
    expect(formatFromFilename("orders.csv")).toBe("csv");
    expect(formatFromFilename("ORDERS.PARQUET")).toBe("parquet");
  });
  it("rejects other or missing extensions", () => {
    expect(formatFromFilename("orders.xlsx")).toBeNull();
    expect(formatFromFilename("orders")).toBeNull();
    expect(formatFromFilename("orders.csv.gz")).toBeNull();
  });
});

describe("fileStem", () => {
  it("drops the last extension only", () => {
    expect(fileStem("orders.v2.csv")).toBe("orders.v2");
    expect(fileStem("orders")).toBe("orders");
  });
});

describe("safeObjectName", () => {
  it("keeps safe names", () => {
    expect(safeObjectName("orders_2026-01.csv")).toBe("orders_2026-01.csv");
  });
  it("replaces spaces, accents and symbols", () => {
    expect(safeObjectName("Ventas 2026 – ñ.csv")).toBe("Ventas_2026_n.csv");
  });
  it("starts with a letter or digit and never ends up empty", () => {
    expect(safeObjectName(".hidden.csv")).toBe("hidden.csv");
    expect(safeObjectName("-x.csv")).toBe("x.csv");
    expect(safeObjectName("????")).toBe("file");
  });
  it("keeps the extension of very long names", () => {
    const name = `${"a".repeat(300)}.parquet`;
    expect(safeObjectName(name)).toHaveLength(100);
    expect(safeObjectName(name).endsWith(".parquet")).toBe(true);
  });
});

describe("storagePath", () => {
  it("is workspace/asset/file/safe name", () => {
    expect(storagePath("w", "a", "f", "my file.csv")).toBe("w/a/f/my_file.csv");
  });
});

describe("checkFile", () => {
  it("accepts a csv under the limit", () => {
    expect(checkFile({ name: "a.csv", size: 10 })).toEqual({
      ok: true,
      format: "csv",
    });
  });
  it("accepts exactly the limit and rejects one byte more", () => {
    expect(checkFile({ name: "a.parquet", size: MAX_FILE_BYTES }).ok).toBe(
      true,
    );
    expect(checkFile({ name: "a.parquet", size: MAX_FILE_BYTES + 1 })).toEqual({
      ok: false,
      message: "Files can be at most 50 MB.",
    });
  });
  it("rejects other formats", () => {
    expect(checkFile({ name: "a.json", size: 1 })).toEqual({
      ok: false,
      message: "Choose a .csv or .parquet file.",
    });
  });
});

describe("filesToPurge", () => {
  const file = (version: number, purgedAt: string | null = null) => ({
    version,
    purgedAt,
  });
  it("returns stored files beyond the newest `keep`", () => {
    const files = [1, 2, 3, 4].map((v) => file(v));
    expect(filesToPurge(files, 2).map((f) => f.version)).toEqual([2, 1]);
  });
  it("skips files already purged", () => {
    expect(
      filesToPurge([file(1, "2026-01-01T00:00:00Z"), file(2), file(3)], 2),
    ).toEqual([]);
  });
  it("returns nothing when under the limit", () => {
    expect(filesToPurge([file(1)], 10)).toEqual([]);
  });
});
```

`src/lib/dataset-file/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatBytes, formatTimestamp, summarizeFile } from "./format";

describe("formatBytes", () => {
  it("uses B, KB and MB with one decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(13_002_342)).toBe("12.4 MB");
  });
});

describe("summarizeFile", () => {
  it("joins name, size, rows and columns", () => {
    expect(
      summarizeFile({
        filename: "orders.parquet",
        sizeBytes: 13_002_342,
        rowCount: 1_204_331,
        columnCount: 14,
      }),
    ).toBe("orders.parquet · 12.4 MB · 1,204,331 rows · 14 columns");
  });
  it("singularises and leaves out an unknown row count", () => {
    expect(
      summarizeFile({
        filename: "a.csv",
        sizeBytes: 10,
        rowCount: null,
        columnCount: 1,
      }),
    ).toBe("a.csv · 10 B · 1 column");
    expect(
      summarizeFile({
        filename: "a.csv",
        sizeBytes: 10,
        rowCount: 1,
        columnCount: 2,
      }),
    ).toBe("a.csv · 10 B · 1 row · 2 columns");
  });
});

describe("formatTimestamp", () => {
  it("formats in UTC", () => {
    expect(formatTimestamp("2026-09-29T14:05:00Z")).toBe(
      "29 Sept 2026, 14:05 UTC",
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run --project unit src/lib/dataset-file`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `limits.ts`**

```ts
/** Formats a dataset file can have (mirrors enum `dataset_file_format`). */
export const DATASET_FILE_FORMATS = ["csv", "parquet"] as const;
export type DatasetFileFormat = (typeof DATASET_FILE_FORMATS)[number];

/** Supabase Free plan upload cap (mirrors the bucket's `file_size_limit`). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Stored files kept per dataset; older ones are purged from Storage. */
export const KEEP_FILE_VERSIONS = 10;
export const DATASET_FILES_BUCKET = "dataset-files";
/** For `<input accept>`. */
export const ACCEPT = ".csv,.parquet";

/** Sent as the upload's content type (the bucket only allows these). */
export const CONTENT_TYPES: Record<DatasetFileFormat, string> = {
  csv: "text/csv",
  parquet: "application/vnd.apache.parquet",
};

export function formatFromFilename(name: string): DatasetFileFormat | null {
  const extension = /\.([^.]+)$/.exec(name.toLowerCase())?.[1];
  return DATASET_FILE_FORMATS.find((f) => f === extension) ?? null;
}

/** `orders.v2.csv` → `orders.v2`. */
export function fileStem(name: string): string {
  return name.replace(/\.[^.]*$/, "") || name;
}

const MAX_OBJECT_NAME = 100;

/** An ASCII-only object key segment; keeps the end (the extension) when long. */
export function safeObjectName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/_(?=\.)/g, "");
  // Keep the end (the extension); the key must start with a letter or digit
  // (the `dataset_files_storage_path_canonical` check).
  const trimmed = cleaned
    .slice(-MAX_OBJECT_NAME)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/_+$/, "");
  return trimmed || "file";
}

export function storagePath(
  workspaceId: string,
  assetId: string,
  fileId: string,
  filename: string,
): string {
  return `${workspaceId}/${assetId}/${fileId}/${safeObjectName(filename)}`;
}

export type FileCheck =
  { ok: true; format: DatasetFileFormat } | { ok: false; message: string };

export function checkFile(file: { name: string; size: number }): FileCheck {
  const format = formatFromFilename(file.name);
  if (!format) return { ok: false, message: "Choose a .csv or .parquet file." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: "Files can be at most 50 MB." };
  }
  return { ok: true, format };
}

/** Stored (not yet purged) files beyond the newest `keep` versions. */
export function filesToPurge<
  T extends { version: number; purgedAt: string | null },
>(files: T[], keep: number = KEEP_FILE_VERSIONS): T[] {
  return [...files]
    .sort((a, b) => b.version - a.version)
    .slice(keep)
    .filter((file) => !file.purgedAt);
}
```

Note: `safeObjectName("Ventas 2026 – ñ.csv")`: NFKD + strip accents gives `Ventas 2026 – n.csv`, the regex turns `–` into `_` → `Ventas_2026_n.csv`. If a test value disagrees, fix the implementation, not the test.

- [ ] **Step 5: Implement `format.ts`**

```ts
const UNITS = ["KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** `orders.parquet · 12.4 MB · 1,204,331 rows · 14 columns`. */
export function summarizeFile({
  filename,
  sizeBytes,
  rowCount,
  columnCount,
}: {
  filename: string;
  sizeBytes: number;
  rowCount: number | null;
  columnCount: number;
}): string {
  return [
    filename,
    formatBytes(sizeBytes),
    rowCount === null ? null : count(rowCount, "row", "rows"),
    count(columnCount, "column", "columns"),
  ]
    .filter(Boolean)
    .join(" · ");
}

const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** `29 Sept 2026, 14:05 UTC` (timestamps are stored in UTC). */
export function formatTimestamp(iso: string): string {
  return `${timestampFormat.format(new Date(iso))} UTC`;
}
```

If the Node ICU prints `Sep` instead of `Sept`, update the expected string in the test to what `Intl` returns (it is locale data, not logic).

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project unit src/lib/dataset-file`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/dataset-file
git commit -m "feat(catalog): dataset file limits and display helpers (C11)"
```

---

### Task 2: Schema diff and carry-over

**Files:**

- Create: `src/lib/dataset-file/schema-diff.ts`
- Test: `src/lib/dataset-file/schema-diff.test.ts`

**Interfaces:**

- Consumes: `ColumnInput` from `@/lib/asset/schema` (`{ name: string; dataType: string; description: string; isPii: boolean }`).
- Produces:
  - `type SchemaDiff = { added: ColumnInput[]; removed: ColumnInput[]; typeChanged: { name: string; before: string; after: string }[]; metaChanged: { name: string; changes: ("renamed" | "description" | "pii")[] }[]; unchanged: ColumnInput[] }`
  - `diffSchemas(before: ColumnInput[], after: ColumnInput[]): SchemaDiff`
  - `hasChanges(diff: SchemaDiff): boolean`
  - `mergeCarryOver(current: ColumnInput[], parsed: ColumnInput[]): ColumnInput[]`
  - `describeDiff(diff: SchemaDiff, isFirst: boolean, columnCount: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import type { ColumnInput } from "@/lib/asset/schema";

import {
  describeDiff,
  diffSchemas,
  hasChanges,
  mergeCarryOver,
} from "./schema-diff";

const col = (
  name: string,
  dataType = "",
  extra: Partial<ColumnInput> = {},
): ColumnInput => ({
  name,
  dataType,
  description: "",
  isPii: false,
  ...extra,
});

describe("diffSchemas", () => {
  it("finds added, removed, retyped and unchanged columns", () => {
    const diff = diffSchemas(
      [col("id", "INT64"), col("amount", "INTEGER"), col("legacy", "STRING")],
      [col("id", "INT64"), col("amount", "DOUBLE"), col("email", "STRING")],
    );
    expect(diff.added.map((c) => c.name)).toEqual(["email"]);
    expect(diff.removed.map((c) => c.name)).toEqual(["legacy"]);
    expect(diff.typeChanged).toEqual([
      { name: "amount", before: "INTEGER", after: "DOUBLE" },
    ]);
    expect(diff.unchanged.map((c) => c.name)).toEqual(["id"]);
    expect(hasChanges(diff)).toBe(true);
  });

  it("matches names case-insensitively and reports a case-only rename", () => {
    const diff = diffSchemas(
      [col("Amount", "DOUBLE")],
      [col("amount", "DOUBLE")],
    );
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.metaChanged).toEqual([
      { name: "amount", changes: ["renamed"] },
    ]);
  });

  it("reports description and PII changes", () => {
    const diff = diffSchemas(
      [col("email", "STRING")],
      [col("email", "STRING", { description: "Contact", isPii: true })],
    );
    expect(diff.metaChanged).toEqual([
      { name: "email", changes: ["description", "pii"] },
    ]);
    expect(diff.unchanged).toEqual([]);
  });

  it("has no changes for identical schemas", () => {
    const columns = [col("id", "INT64")];
    expect(hasChanges(diffSchemas(columns, columns))).toBe(false);
  });
});

describe("mergeCarryOver", () => {
  it("keeps descriptions and PII flags by name, takes names and types from the file", () => {
    const merged = mergeCarryOver(
      [
        col("Email", "text", { description: "Contact", isPii: true }),
        col("legacy"),
      ],
      [col("email", "STRING"), col("created_at", "TIMESTAMP")],
    );
    expect(merged).toEqual([
      col("email", "STRING", { description: "Contact", isPii: true }),
      col("created_at", "TIMESTAMP"),
    ]);
  });
});

describe("describeDiff", () => {
  it("summarises the first version by its column count", () => {
    expect(describeDiff(diffSchemas([], [col("a"), col("b")]), true, 2)).toBe(
      "Initial schema · 2 columns",
    );
  });
  it("lists the kinds of change", () => {
    const diff = diffSchemas(
      [col("a", "INTEGER"), col("b")],
      [col("a", "DOUBLE"), col("c")],
    );
    expect(describeDiff(diff, false, 2)).toBe(
      "1 added · 1 removed · 1 type change",
    );
  });
  it("says when only descriptions or flags changed", () => {
    const diff = diffSchemas([col("a")], [col("a", "", { isPii: true })]);
    expect(describeDiff(diff, false, 1)).toBe("1 column documented");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/lib/dataset-file/schema-diff.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project unit src/lib/dataset-file/schema-diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dataset-file/schema-diff.ts src/lib/dataset-file/schema-diff.test.ts
git commit -m "feat(catalog): schema diff and column carry-over (C11)"
```

---

### Task 3: CSV schema inference

**Files:**

- Create: `src/lib/dataset-file/types.ts`, `src/lib/dataset-file/parse-csv.ts`
- Test: `src/lib/dataset-file/parse-csv.test.ts`

**Interfaces:**

- Consumes: `ColumnInput`, `MAX_COLUMNS`, `MAX_COLUMN_NAME` from `@/lib/asset/schema`.
- Produces: `type ParsedSchema = { columns: ColumnInput[]; rowCount: number | null }`; `class DatasetFileError extends Error`; `validateColumnNames(names: string[]): void` (throws `DatasetFileError`); `createCsvSchemaBuilder(): { addRow(row: string[]): void; finish(): ParsedSchema }`; `parseCsvText(text: string): ParsedSchema`; `parseCsvFile(file: File, onProgress?: (fraction: number) => void): Promise<ParsedSchema>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { parseCsvFile, parseCsvText } from "./parse-csv";
import { DatasetFileError } from "./types";

const types = (csv: string) =>
  Object.fromEntries(
    parseCsvText(csv).columns.map((c) => [c.name, c.dataType]),
  );

describe("parseCsvText", () => {
  it("reads the header and counts data rows", () => {
    const parsed = parseCsvText("id,name\n1,Ada\n2,Grace\n");
    expect(parsed.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.columns[0]).toEqual({
      name: "id",
      dataType: "INTEGER",
      description: "",
      isPii: false,
    });
  });

  it("infers each type and falls back to STRING", () => {
    expect(
      types(
        [
          "b,i,d,day,ts,s",
          "true,1,1.5,2026-01-01,2026-01-01T10:00:00Z,x",
          "FALSE,-20,3,2026-02-28,2026-01-01 10:00,y",
        ].join("\n"),
      ),
    ).toEqual({
      b: "BOOLEAN",
      i: "INTEGER",
      d: "DECIMAL",
      day: "DATE",
      ts: "TIMESTAMP",
      s: "STRING",
    });
  });

  it("widens dates mixed with timestamps and integers mixed with decimals", () => {
    expect(types("t,n\n2026-01-01,1\n2026-01-01T00:00:00,2.5\n")).toEqual({
      t: "TIMESTAMP",
      n: "DECIMAL",
    });
  });

  it("ignores empty cells; an all-empty column is STRING", () => {
    expect(types("a,b\n1,\n,\n3,\n")).toEqual({ a: "INTEGER", b: "STRING" });
  });

  it("keeps codes with leading zeros as STRING", () => {
    expect(types("zip\n02134\n10001\n")).toEqual({ zip: "STRING" });
  });

  it("accepts a header-only file", () => {
    const parsed = parseCsvText("id,name\n");
    expect(parsed.rowCount).toBe(0);
    expect(parsed.columns.map((c) => c.dataType)).toEqual(["STRING", "STRING"]);
  });

  it("handles a BOM, semicolons and CRLF", () => {
    const parsed = parseCsvText('﻿id;amount;note\r\n1;2.5;"a;b"\r\n');
    expect(parsed.columns.map((c) => [c.name, c.dataType])).toEqual([
      ["id", "INTEGER"],
      ["amount", "DECIMAL"],
      ["note", "STRING"],
    ]);
  });

  it("trims header names", () => {
    expect(
      parseCsvText(" id , name \n1,a\n").columns.map((c) => c.name),
    ).toEqual(["id", "name"]);
  });

  it("rejects an empty file", () => {
    expect(() => parseCsvText("")).toThrow(
      new DatasetFileError("The file is empty."),
    );
  });

  it("rejects blank and duplicate header names", () => {
    expect(() => parseCsvText("id,,name\n")).toThrow(
      "Column 2 has no name in the header row.",
    );
    expect(() => parseCsvText("id,ID\n")).toThrow(
      "Duplicate column names: ID.",
    );
  });
});

describe("parseCsvFile", () => {
  it("streams a File and reports progress", async () => {
    const progress: number[] = [];
    const file = new File(["id,amount\n1,2.5\n"], "orders.csv", {
      type: "text/csv",
    });
    const parsed = await parseCsvFile(file, (p) => progress.push(p));
    expect(parsed.columns.map((c) => c.dataType)).toEqual([
      "INTEGER",
      "DECIMAL",
    ]);
    expect(parsed.rowCount).toBe(1);
    expect(progress.at(-1)).toBe(1);
  });

  it("rejects with the header error", async () => {
    const file = new File(["a,a\n"], "bad.csv");
    await expect(parseCsvFile(file)).rejects.toThrow(
      "Duplicate column names: a.",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/lib/dataset-file/parse-csv.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `types.ts`**

```ts
import {
  MAX_COLUMN_NAME,
  MAX_COLUMNS,
  type ColumnInput,
} from "@/lib/asset/schema";

/** Columns (no descriptions, no PII flags) and the row count when known. */
export type ParsedSchema = { columns: ColumnInput[]; rowCount: number | null };

/** A file problem worth showing to the user as is. */
export class DatasetFileError extends Error {
  override name = "DatasetFileError";
}

/** Throws when names are blank, too long, duplicated (case-insensitive) or too many. */
export function validateColumnNames(names: string[]): void {
  if (names.length > MAX_COLUMNS) {
    throw new DatasetFileError(
      `The file has ${names.length} columns; the limit is ${MAX_COLUMNS}.`,
    );
  }
  const blank = names.findIndex((name) => !name.trim());
  if (blank >= 0) {
    throw new DatasetFileError(
      `Column ${blank + 1} has no name in the header row.`,
    );
  }
  const long = names.find((name) => name.length > MAX_COLUMN_NAME);
  if (long) {
    throw new DatasetFileError(
      `Column names can be at most ${MAX_COLUMN_NAME} characters.`,
    );
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) duplicates.add(name);
    seen.add(key);
  }
  if (duplicates.size) {
    throw new DatasetFileError(
      `Duplicate column names: ${[...duplicates].join(", ")}.`,
    );
  }
}
```

- [ ] **Step 4: Implement `parse-csv.ts`**

```ts
import Papa from "papaparse";

import {
  DatasetFileError,
  validateColumnNames,
  type ParsedSchema,
} from "./types";

// Candidate types, most specific first. A value removes every type it does
// not match; a column gets the first type left (INTEGER ⊂ DECIMAL,
// DATE ⊂ TIMESTAMP), or STRING when none is left or it has no values.
const TYPES = [
  ["BOOLEAN", /^(true|false)$/i],
  ["INTEGER", /^[+-]?(0|[1-9]\d*)$/],
  ["DECIMAL", /^[+-]?((0|[1-9]\d*)(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/],
  ["DATE", /^\d{4}-\d{2}-\d{2}$/],
  [
    "TIMESTAMP",
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  ],
] as const;
const ALL_TYPES = (1 << TYPES.length) - 1;

function typeName(hasValues: boolean, mask: number): string {
  if (!hasValues || mask === 0) return "STRING";
  const index = TYPES.findIndex((_, bit) => mask & (1 << bit));
  return TYPES[index]![0];
}

/** Feeds rows one by one (the first is the header) and infers column types. */
export function createCsvSchemaBuilder() {
  let header: string[] | null = null;
  let masks: number[] = [];
  let hasValues: boolean[] = [];
  let rows = 0;

  return {
    addRow(row: string[]) {
      if (!header) {
        header = row.map((cell, i) =>
          (i === 0 ? cell.replace(/^﻿/, "") : cell).trim(),
        );
        validateColumnNames(header);
        masks = header.map(() => ALL_TYPES);
        hasValues = header.map(() => false);
        return;
      }
      rows += 1;
      for (let i = 0; i < header.length; i++) {
        const value = (row[i] ?? "").trim();
        if (!value) continue;
        hasValues[i] = true;
        let mask = masks[i]!;
        TYPES.forEach(([, pattern], bit) => {
          if (mask & (1 << bit) && !pattern.test(value)) mask &= ~(1 << bit);
        });
        masks[i] = mask;
      }
    },
    finish(): ParsedSchema {
      if (!header) throw new DatasetFileError("The file is empty.");
      return {
        columns: header.map((name, i) => ({
          name,
          dataType: typeName(hasValues[i]!, masks[i]!),
          description: "",
          isPii: false,
        })),
        rowCount: rows,
      };
    },
  };
}

const PARSE_OPTIONS = { skipEmptyLines: "greedy" } as const;

export function parseCsvText(text: string): ParsedSchema {
  const builder = createCsvSchemaBuilder();
  const result = Papa.parse<string[]>(text, PARSE_OPTIONS);
  for (const row of result.data) builder.addRow(row);
  return builder.finish();
}

const CHUNK_BYTES = 1024 * 1024;

/**
 * Streams `file` in 1 MB chunks on the main thread (papaparse's worker mode
 * does not survive bundling). The delimiter is guessed from the first chunk.
 */
export function parseCsvFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ParsedSchema> {
  return new Promise((resolve, reject) => {
    const builder = createCsvSchemaBuilder();
    let chunks = 0;
    let failed = false;
    Papa.parse<string[]>(file, {
      ...PARSE_OPTIONS,
      chunkSize: CHUNK_BYTES,
      chunk(results, parser) {
        try {
          for (const row of results.data) builder.addRow(row);
          chunks += 1;
          onProgress?.(
            Math.min(0.99, (chunks * CHUNK_BYTES) / Math.max(file.size, 1)),
          );
        } catch (error) {
          failed = true;
          parser.abort();
          reject(error);
        }
      },
      complete() {
        if (failed) return;
        try {
          const parsed = builder.finish();
          onProgress?.(1);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      },
      error(error) {
        reject(
          new DatasetFileError(`Could not read the CSV: ${error.message}`),
        );
      },
    });
  });
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run --project unit src/lib/dataset-file/parse-csv.test.ts`
Expected: PASS. If the `File` streaming test fails in jsdom because papaparse's `FileStreamer` needs `FileReader` behaviour jsdom lacks, keep the test but give it `// @vitest-environment node` is **not** an option (no `File` reader there either); instead assert through `parseCsvText` and cover `parseCsvFile` in the e2e test — note the change in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dataset-file/types.ts src/lib/dataset-file/parse-csv.ts src/lib/dataset-file/parse-csv.test.ts
git commit -m "feat(catalog): infer a dataset schema from CSV files (C11)"
```

---

### Task 4: Parquet schema reading and the parse entry point

**Files:**

- Create: `src/lib/dataset-file/parse-parquet.ts`, `src/lib/dataset-file/parse.ts`
- Test: `src/lib/dataset-file/parse-parquet.test.ts`, `src/lib/dataset-file/parse.test.ts`

**Interfaces:**

- Consumes: `ParsedSchema`, `DatasetFileError`, `validateColumnNames` (Task 3); `checkFile`, `DatasetFileFormat` (Task 1); `MAX_COLUMN_TYPE`.
- Produces: `parquetTypeName(node: SchemaTree): string`; `parseParquetFile(file: Blob): Promise<ParsedSchema>`; `type ParsedDatasetFile = ParsedSchema & { file: File; format: DatasetFileFormat }`; `parseDatasetFile(file: File, onProgress?): Promise<{ ok: true; parsed: ParsedDatasetFile } | { ok: false; message: string }>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/dataset-file/parse-parquet.test.ts`:

```ts
import type { SchemaElement, SchemaTree } from "hyparquet";
import { parquetWriteBuffer } from "hyparquet-writer";
import { describe, expect, it } from "vitest";

import { parquetTypeName, parseParquetFile } from "./parse-parquet";

const node = (
  element: SchemaElement,
  children: SchemaTree[] = [],
): SchemaTree => ({
  element,
  children,
  count: 1,
  path: [element.name],
});

describe("parquetTypeName", () => {
  it("names primitives and logical types", () => {
    expect(parquetTypeName(node({ name: "a", type: "INT64" }))).toBe("INT64");
    expect(
      parquetTypeName(
        node({
          name: "a",
          type: "BYTE_ARRAY",
          logical_type: { type: "STRING" },
        }),
      ),
    ).toBe("STRING");
    expect(
      parquetTypeName(
        node({ name: "a", type: "BYTE_ARRAY", converted_type: "UTF8" }),
      ),
    ).toBe("STRING");
    expect(parquetTypeName(node({ name: "a", type: "BYTE_ARRAY" }))).toBe(
      "BINARY",
    );
    expect(
      parquetTypeName(
        node({
          name: "a",
          type: "INT64",
          logical_type: { type: "DECIMAL", precision: 10, scale: 2 },
        }),
      ),
    ).toBe("DECIMAL(10,2)");
    expect(
      parquetTypeName(
        node({
          name: "a",
          type: "INT64",
          logical_type: {
            type: "TIMESTAMP",
            unit: "MICROS",
            isAdjustedToUTC: true,
          },
        }),
      ),
    ).toBe("TIMESTAMP(MICROS, UTC)");
    expect(
      parquetTypeName(
        node({ name: "a", type: "INT64", converted_type: "TIMESTAMP_MILLIS" }),
      ),
    ).toBe("TIMESTAMP(MILLIS)");
    expect(
      parquetTypeName(
        node({
          name: "a",
          type: "INT32",
          logical_type: { type: "INTEGER", bitWidth: 16, isSigned: false },
        }),
      ),
    ).toBe("UINT16");
    expect(
      parquetTypeName(
        node({ name: "a", type: "FIXED_LEN_BYTE_ARRAY", type_length: 16 }),
      ),
    ).toBe("FIXED(16)");
  });

  it("names lists, maps and structs", () => {
    const list = node({ name: "tags", logical_type: { type: "LIST" } }, [
      node({ name: "list", repetition_type: "REPEATED" }, [
        node({
          name: "element",
          type: "BYTE_ARRAY",
          logical_type: { type: "STRING" },
        }),
      ]),
    ]);
    expect(parquetTypeName(list)).toBe("LIST<STRING>");

    const map = node({ name: "attrs", converted_type: "MAP" }, [
      node({ name: "key_value", repetition_type: "REPEATED" }, [
        node({ name: "key", type: "BYTE_ARRAY", converted_type: "UTF8" }),
        node({ name: "value", type: "INT32" }),
      ]),
    ]);
    expect(parquetTypeName(map)).toBe("MAP<STRING, INT32>");

    const struct = node({ name: "address" }, [
      node({
        name: "city",
        type: "BYTE_ARRAY",
        logical_type: { type: "STRING" },
      }),
      node({ name: "zip", type: "INT32" }),
    ]);
    expect(parquetTypeName(struct)).toBe("STRUCT<city: STRING, zip: INT32>");

    expect(
      parquetTypeName(
        node({ name: "legacy", type: "INT32", repetition_type: "REPEATED" }),
      ),
    ).toBe("LIST<INT32>");
  });

  it("clips type names to 100 characters", () => {
    const wide = node(
      { name: "wide" },
      Array.from({ length: 20 }, (_, i) =>
        node({ name: `field_${i}`, type: "INT64" }),
      ),
    );
    const name = parquetTypeName(wide);
    expect(name).toHaveLength(100);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("parseParquetFile", () => {
  it("reads columns and the row count from the footer", async () => {
    const buffer = parquetWriteBuffer({
      columnData: [
        { name: "order_id", data: [1n, 2n], type: "INT64" },
        { name: "customer", data: ["a", "b"], type: "STRING" },
        { name: "amount", data: [1.5, 2.25], type: "DOUBLE" },
        { name: "paid", data: [true, false], type: "BOOLEAN" },
        {
          name: "ordered_at",
          data: [new Date(0), new Date(1000)],
          type: "TIMESTAMP",
        },
      ],
    });
    const parsed = await parseParquetFile(new File([buffer], "orders.parquet"));
    expect(parsed.rowCount).toBe(2);
    expect(parsed.columns.map((c) => c.name)).toEqual([
      "order_id",
      "customer",
      "amount",
      "paid",
      "ordered_at",
    ]);
    const types = parsed.columns.map((c) => c.dataType);
    expect(types.slice(0, 4)).toEqual(["INT64", "STRING", "DOUBLE", "BOOLEAN"]);
    expect(types[4]).toMatch(/^TIMESTAMP\(MILLIS/);
  });

  it("rejects a file that is not Parquet", async () => {
    await expect(
      parseParquetFile(new File(["id,name\n"], "fake.parquet")),
    ).rejects.toThrow("This is not a readable Parquet file.");
  });
});
```

`src/lib/dataset-file/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseDatasetFile } from "./parse";

describe("parseDatasetFile", () => {
  it("parses a CSV and keeps the file and format", async () => {
    const file = new File(["id\n1\n"], "a.csv");
    const result = await parseDatasetFile(file);
    expect(result).toMatchObject({
      ok: true,
      parsed: { format: "csv", rowCount: 1, file },
    });
  });

  it("returns the check message for other formats", async () => {
    expect(await parseDatasetFile(new File(["x"], "a.txt"))).toEqual({
      ok: false,
      message: "Choose a .csv or .parquet file.",
    });
  });

  it("returns parser messages instead of throwing", async () => {
    expect(await parseDatasetFile(new File(["a,a\n"], "a.csv"))).toEqual({
      ok: false,
      message: "Duplicate column names: a.",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/lib/dataset-file/parse-parquet.test.ts src/lib/dataset-file/parse.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `parse-parquet.ts`**

```ts
import {
  parquetMetadataAsync,
  parquetSchema,
  type AsyncBuffer,
  type SchemaTree,
} from "hyparquet";

import { MAX_COLUMN_TYPE } from "@/lib/asset/schema";

import {
  DatasetFileError,
  validateColumnNames,
  type ParsedSchema,
} from "./types";

/** Reads only the byte ranges hyparquet asks for (the footer), not the file. */
function blobBuffer(file: Blob): AsyncBuffer {
  return {
    byteLength: file.size,
    slice: (start, end) => file.slice(start, end).arrayBuffer(),
  };
}

const CONVERTED: Partial<Record<string, string>> = {
  UTF8: "STRING",
  ENUM: "ENUM",
  JSON: "JSON",
  BSON: "BSON",
  DATE: "DATE",
  INTERVAL: "INTERVAL",
  TIMESTAMP_MILLIS: "TIMESTAMP(MILLIS)",
  TIMESTAMP_MICROS: "TIMESTAMP(MICROS)",
  TIME_MILLIS: "TIME(MILLIS)",
  TIME_MICROS: "TIME(MICROS)",
};

function describe(node: SchemaTree): string {
  const { element, children } = node;
  const logical = element.logical_type;

  if (logical?.type === "LIST" || element.converted_type === "LIST") {
    const repeated = children[0];
    if (!repeated) return "LIST<UNKNOWN>";
    // 3-level lists wrap the element in a repeated group of one child.
    const item =
      repeated.children.length === 1 ? repeated.children[0]! : repeated;
    return `LIST<${describe(item)}>`;
  }
  if (logical?.type === "MAP" || element.converted_type === "MAP") {
    const [key, value] = children[0]?.children ?? [];
    return `MAP<${key ? describe(key) : "UNKNOWN"}, ${value ? describe(value) : "UNKNOWN"}>`;
  }
  if (children.length) {
    return `STRUCT<${children.map((child) => `${child.element.name}: ${parquetTypeName(child)}`).join(", ")}>`;
  }

  switch (logical?.type) {
    case "DECIMAL":
      return `DECIMAL(${logical.precision},${logical.scale})`;
    case "TIMESTAMP":
    case "TIME":
      return `${logical.type}(${logical.unit}${logical.isAdjustedToUTC ? ", UTC" : ""})`;
    case "INTEGER":
      return `${logical.isSigned ? "INT" : "UINT"}${logical.bitWidth}`;
    case undefined:
      break;
    default:
      return logical.type;
  }

  const converted = element.converted_type;
  if (converted === "DECIMAL")
    return `DECIMAL(${element.precision ?? 0},${element.scale ?? 0})`;
  if (converted && /^U?INT_\d+$/.test(converted))
    return converted.replace("_", "");
  if (converted && CONVERTED[converted]) return CONVERTED[converted]!;

  switch (element.type) {
    case "BYTE_ARRAY":
      return "BINARY";
    case "FIXED_LEN_BYTE_ARRAY":
      return `FIXED(${element.type_length ?? 0})`;
    case undefined:
      return "UNKNOWN";
    default:
      return element.type;
  }
}

function clip(name: string): string {
  return name.length > MAX_COLUMN_TYPE
    ? `${name.slice(0, MAX_COLUMN_TYPE - 1)}…`
    : name;
}

/** A readable type: `INT64`, `DECIMAL(10,2)`, `LIST<STRING>`, `STRUCT<a: INT32>`. */
export function parquetTypeName(node: SchemaTree): string {
  const name =
    node.element.repetition_type === "REPEATED" && !node.children.length
      ? `LIST<${describe(node)}>`
      : describe(node);
  return clip(name);
}

export async function parseParquetFile(file: Blob): Promise<ParsedSchema> {
  let metadata;
  try {
    metadata = await parquetMetadataAsync(blobBuffer(file));
  } catch {
    throw new DatasetFileError("This is not a readable Parquet file.");
  }
  const root = parquetSchema(metadata);
  const columns = root.children.map((child) => ({
    name: child.element.name,
    dataType: parquetTypeName(child),
    description: "",
    isPii: false,
  }));
  validateColumnNames(columns.map((column) => column.name));
  return { columns, rowCount: Number(metadata.num_rows) };
}
```

Note on the struct clip test: `STRUCT<field_0: INT64, …>` with 20 fields is > 100 characters, so it is clipped to 99 + `…`. Nested `parquetTypeName` calls clip inner parts too; that is fine.

- [ ] **Step 4: Implement `parse.ts`**

```ts
import { checkFile, type DatasetFileFormat } from "./limits";
import { parseCsvFile } from "./parse-csv";
import { parseParquetFile } from "./parse-parquet";
import { DatasetFileError, type ParsedSchema } from "./types";

export type ParsedDatasetFile = ParsedSchema & {
  file: File;
  format: DatasetFileFormat;
};

export type ParseResult =
  { ok: true; parsed: ParsedDatasetFile } | { ok: false; message: string };

/** Checks and reads a file in the browser; never throws. */
export async function parseDatasetFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ParseResult> {
  const checked = checkFile(file);
  if (!checked.ok) return checked;
  try {
    const schema =
      checked.format === "csv"
        ? await parseCsvFile(file, onProgress)
        : await parseParquetFile(file);
    return { ok: true, parsed: { ...schema, file, format: checked.format } };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DatasetFileError
          ? error.message
          : "Could not read the file.",
    };
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run --project unit src/lib/dataset-file`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dataset-file
git commit -m "feat(catalog): read dataset schemas from Parquet footers (C11)"
```

---

### Task 5: Migration — bucket, tables, RLS, schema snapshots, `add_dataset_file`

**Files:**

- Create: `supabase/migrations/<timestamp>_dataset_files.sql` (create with `pnpm supabase migration new dataset_files`)
- Modify: `src/lib/db/types.ts` (regenerated)

**Interfaces:**

- Produces (SQL):
  - enums `public.dataset_file_format ('csv','parquet')`, `public.schema_change_source ('manual','file')`
  - tables `public.dataset_files`, `public.dataset_schema_versions` (columns per spec §2)
  - `public.set_dataset_columns(asset uuid, columns jsonb, source schema_change_source default 'manual', file_id uuid default null) returns setof dataset_columns`
  - `public.add_dataset_file(asset uuid, file_id uuid, storage_path text, filename text, format dataset_file_format, columns jsonb, row_count bigint default null) returns dataset_files`
  - Storage bucket `dataset-files` with select/insert policies.
- Produces (TS, generated): `Database["public"]["Tables"]["dataset_files" | "dataset_schema_versions"]`, `Database["public"]["Functions"]["add_dataset_file"]`, enums in `Constants`.

- [ ] **Step 1: Create the migration file**

Run: `pnpm supabase migration new dataset_files`

- [ ] **Step 2: Write the migration**

```sql
-- C11 — dataset files & schema history.
--
-- * A dataset has file versions (`dataset_files`): every upload is a new,
--   immutable version; the highest is the current file. Objects live in the
--   private bucket `dataset-files` at `{workspace}/{asset}/{file}/{name}`.
--   The service role purges stored objects beyond the newest 10
--   (`purged_at`) and removes them when the dataset is deleted.
-- * `dataset_schema_versions` is the append-only history of a dataset's
--   columns. `set_dataset_columns` snapshots the columns after every write
--   that changes them (manual edits, `create_asset`, file uploads). An empty
--   schema is never the first snapshot.
-- * `add_dataset_file` records an uploaded object as the next file version
--   and applies its columns in one transaction. A trigger checks the object
--   exists at the row's path and takes its size from Storage.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.dataset_file_format as enum ('csv', 'parquet');
create type public.schema_change_source as enum ('manual', 'file');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.dataset_files (
  id uuid primary key,
  asset_id uuid not null,
  workspace_id uuid not null,
  asset_kind public.asset_kind not null default 'dataset'
    constraint dataset_files_kind_is_dataset check (asset_kind = 'dataset'),
  version integer not null
    constraint dataset_files_version_positive check (version >= 1),
  storage_path text not null
    constraint dataset_files_storage_path_key unique
    constraint dataset_files_storage_path_canonical check (
      split_part(storage_path, '/', 1) = workspace_id::text
      and split_part(storage_path, '/', 2) = asset_id::text
      and split_part(storage_path, '/', 3) = id::text
      and split_part(storage_path, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
      and split_part(storage_path, '/', 5) = ''
    ),
  filename text not null
    constraint dataset_files_filename_valid check (
      char_length(filename) between 1 and 255 and position('/' in filename) = 0
    ),
  format public.dataset_file_format not null,
  size_bytes bigint not null default 0
    constraint dataset_files_size_valid check (size_bytes between 0 and 52428800),
  row_count bigint
    constraint dataset_files_row_count_valid check (row_count >= 0),
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  purged_at timestamptz,
  constraint dataset_files_asset_fk foreign key (asset_id, workspace_id, asset_kind)
    references public.assets (id, workspace_id, kind) on delete cascade,
  constraint dataset_files_asset_version_key unique (asset_id, version)
);

create index dataset_files_asset_id_workspace_id_asset_kind_idx
  on public.dataset_files (asset_id, workspace_id, asset_kind);
create index dataset_files_uploaded_by_idx on public.dataset_files (uploaded_by);

create table public.dataset_schema_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  workspace_id uuid not null,
  asset_kind public.asset_kind not null default 'dataset'
    constraint dataset_schema_versions_kind_is_dataset check (asset_kind = 'dataset'),
  version integer not null
    constraint dataset_schema_versions_version_positive check (version >= 1),
  columns jsonb not null
    constraint dataset_schema_versions_columns_array check (jsonb_typeof(columns) = 'array'),
  source public.schema_change_source not null,
  file_id uuid references public.dataset_files (id) on delete set null
    constraint dataset_schema_versions_file_needs_file_source check (
      file_id is null or source = 'file'
    ),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dataset_schema_versions_asset_fk foreign key (asset_id, workspace_id, asset_kind)
    references public.assets (id, workspace_id, kind) on delete cascade,
  constraint dataset_schema_versions_asset_version_key unique (asset_id, version)
);

create index dataset_schema_versions_asset_id_workspace_id_asset_kind_idx
  on public.dataset_schema_versions (asset_id, workspace_id, asset_kind);
create index dataset_schema_versions_file_id_idx on public.dataset_schema_versions (file_id);
create index dataset_schema_versions_created_by_idx on public.dataset_schema_versions (created_by);

-- ---------------------------------------------------------------------------
-- Storage: dataset-files
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dataset-files',
  'dataset-files',
  false,
  52428800, -- 50 MB (Supabase Free plan cap)
  array['text/csv', 'application/vnd.apache.parquet']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The dataset an object path `{workspace}/{asset}/{file}/{name}` belongs to,
-- or null when the path is malformed or the asset is not a dataset of that
-- workspace. Security definer: callers may not see the asset row.
create function private.dataset_file_asset(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  result uuid;
begin
  if coalesce(array_length(folders, 1), 0) <> 3
     or folders[1] !~ uuid_pattern
     or folders[2] !~ uuid_pattern
     or folders[3] !~ uuid_pattern then
    return null;
  end if;
  select a.id into result
  from public.assets a
  where a.id = folders[2]::uuid
    and a.workspace_id = folders[1]::uuid
    and a.kind = 'dataset';
  return result;
end;
$$;

revoke execute on function private.dataset_file_asset(text) from public, anon;
grant execute on function private.dataset_file_asset(text) to authenticated, service_role;

create policy "dataset-files: readable with the dataset"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dataset-files'
    and private.can_read_entity(private.dataset_file_asset(name))
  );

create policy "dataset-files: dataset writers upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dataset-files'
    and private.can_write_entity(private.dataset_file_asset(name))
  );

-- No update or delete policies: versions are immutable, and only the service
-- role removes objects (retention, dataset deletion).

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A file row points at an uploaded object; its size comes from Storage.
-- Security definer: reads `storage.objects` regardless of the caller.
create function private.dataset_files_require_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_size bigint;
begin
  select coalesce((o.metadata ->> 'size')::bigint, 0) into object_size
  from storage.objects o
  where o.bucket_id = 'dataset-files'
    and o.name = new.storage_path;
  if not found then
    raise exception 'the file was not uploaded' using errcode = 'P0002';
  end if;
  new.size_bytes := object_size;
  return new;
end;
$$;

create trigger dataset_files_require_object
  before insert on public.dataset_files
  for each row execute function private.dataset_files_require_object();

revoke execute on function private.dataset_files_require_object()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security (default deny)
-- ---------------------------------------------------------------------------

alter table public.dataset_files enable row level security;
alter table public.dataset_schema_versions enable row level security;

revoke all on table public.dataset_files, public.dataset_schema_versions from anon;
-- Append-only for users; the service role sets `purged_at`.
revoke update, delete on table public.dataset_files, public.dataset_schema_versions
  from authenticated;

create policy "dataset_files: readable with the dataset"
  on public.dataset_files for select to authenticated
  using ((select private.can_read_entity(asset_id)));

create policy "dataset_files: dataset writers add"
  on public.dataset_files for insert to authenticated
  with check (
    (select private.can_write_entity(asset_id))
    and uploaded_by = (select auth.uid())
  );

create policy "dataset_schema_versions: readable with the dataset"
  on public.dataset_schema_versions for select to authenticated
  using ((select private.can_read_entity(asset_id)));

create policy "dataset_schema_versions: dataset writers add"
  on public.dataset_schema_versions for insert to authenticated
  with check (
    (select private.can_write_entity(asset_id))
    and created_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- set_dataset_columns: now snapshots the schema
-- ---------------------------------------------------------------------------

drop function public.set_dataset_columns(uuid, jsonb);

-- Replaces a dataset's columns with `columns` (see C02) and, when the result
-- differs from the latest snapshot, records the next schema version.
-- `source = 'file'` requires `file_id`, a file of the same dataset.
create function public.set_dataset_columns(
  asset uuid,
  columns jsonb,
  source public.schema_change_source default 'manual',
  file_id uuid default null
)
returns setof public.dataset_columns
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws uuid;
  snapshot jsonb;
  last_columns jsonb;
  last_version integer;
begin
  if jsonb_typeof(set_dataset_columns.columns) is distinct from 'array' then
    raise exception 'columns must be a JSON array' using errcode = '22023';
  end if;
  if (set_dataset_columns.source = 'file') <> (set_dataset_columns.file_id is not null) then
    raise exception 'a file change needs its file' using errcode = '22023';
  end if;

  select a.workspace_id into ws
  from public.assets a
  where a.id = set_dataset_columns.asset
    and a.kind = 'dataset';
  if ws is null or not private.can_write_entity(set_dataset_columns.asset) then
    raise exception 'dataset not found or not editable' using errcode = '42501';
  end if;

  if set_dataset_columns.file_id is not null and not exists (
    select 1 from public.dataset_files f
    where f.id = set_dataset_columns.file_id
      and f.asset_id = set_dataset_columns.asset
  ) then
    raise exception 'the file belongs to another dataset' using errcode = '22023';
  end if;

  -- One writer per dataset at a time, so versions stay consecutive.
  perform pg_advisory_xact_lock(hashtextextended('dataset:' || set_dataset_columns.asset::text, 0));

  delete from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
    and dc.name not in (
      select (c ->> 'name')::extensions.citext
      from jsonb_array_elements(set_dataset_columns.columns) as c
      where c ->> 'name' is not null
    );

  insert into public.dataset_columns as dc
    (asset_id, workspace_id, name, data_type, description, is_pii, ordinal)
  select
    set_dataset_columns.asset,
    ws,
    btrim(c.value ->> 'name'),
    coalesce(btrim(c.value ->> 'data_type'), ''),
    coalesce(btrim(c.value ->> 'description'), ''),
    coalesce((c.value ->> 'is_pii')::boolean, false),
    (c.ordinality - 1)::integer
  from jsonb_array_elements(set_dataset_columns.columns) with ordinality as c(value, ordinality)
  on conflict (asset_id, name) do update
  set
    name = excluded.name,
    data_type = excluded.data_type,
    description = excluded.description,
    is_pii = excluded.is_pii,
    ordinal = excluded.ordinal;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', dc.name::text,
        'data_type', dc.data_type,
        'description', dc.description,
        'is_pii', dc.is_pii
      )
      order by dc.ordinal
    ),
    '[]'::jsonb
  ) into snapshot
  from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset;

  select v.version, v.columns into last_version, last_columns
  from public.dataset_schema_versions v
  where v.asset_id = set_dataset_columns.asset
  order by v.version desc
  limit 1;

  if (last_version is null and snapshot <> '[]'::jsonb)
     or (last_version is not null and snapshot is distinct from last_columns) then
    insert into public.dataset_schema_versions
      (asset_id, workspace_id, version, columns, source, file_id)
    values (
      set_dataset_columns.asset,
      ws,
      coalesce(last_version, 0) + 1,
      snapshot,
      set_dataset_columns.source,
      set_dataset_columns.file_id
    );
  end if;

  return query
  select dc.*
  from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
  order by dc.ordinal;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_dataset_file
-- ---------------------------------------------------------------------------

-- Records the uploaded object at `storage_path` as the dataset's next file
-- version and applies `columns` (the reviewed schema) from it.
create function public.add_dataset_file(
  asset uuid,
  file_id uuid,
  storage_path text,
  filename text,
  format public.dataset_file_format,
  columns jsonb,
  row_count bigint default null
)
returns public.dataset_files
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws uuid;
  next_version integer;
  result public.dataset_files;
begin
  select a.workspace_id into ws
  from public.assets a
  where a.id = add_dataset_file.asset
    and a.kind = 'dataset';
  if ws is null or not private.can_write_entity(add_dataset_file.asset) then
    raise exception 'dataset not found or not editable' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dataset:' || add_dataset_file.asset::text, 0));

  select coalesce(max(f.version), 0) + 1 into next_version
  from public.dataset_files f
  where f.asset_id = add_dataset_file.asset;

  insert into public.dataset_files
    (id, asset_id, workspace_id, version, storage_path, filename, format, row_count)
  values (
    add_dataset_file.file_id,
    add_dataset_file.asset,
    ws,
    next_version,
    add_dataset_file.storage_path,
    add_dataset_file.filename,
    add_dataset_file.format,
    add_dataset_file.row_count
  )
  returning * into result;

  perform public.set_dataset_columns(
    add_dataset_file.asset,
    add_dataset_file.columns,
    'file',
    add_dataset_file.file_id
  );

  return result;
end;
$$;

revoke execute on function
  public.set_dataset_columns(uuid, jsonb, public.schema_change_source, uuid),
  public.add_dataset_file(uuid, uuid, text, text, public.dataset_file_format, jsonb, bigint)
from public, anon;

grant execute on function
  public.set_dataset_columns(uuid, jsonb, public.schema_change_source, uuid),
  public.add_dataset_file(uuid, uuid, text, text, public.dataset_file_format, jsonb, bigint)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill: existing datasets start their history at v1
-- ---------------------------------------------------------------------------

insert into public.dataset_schema_versions
  (asset_id, workspace_id, version, columns, source, created_by)
select
  dc.asset_id,
  dc.workspace_id,
  1,
  jsonb_agg(
    jsonb_build_object(
      'name', dc.name::text,
      'data_type', dc.data_type,
      'description', dc.description,
      'is_pii', dc.is_pii
    )
    order by dc.ordinal
  ),
  'manual',
  null
from public.dataset_columns dc
group by dc.asset_id, dc.workspace_id;
```

Why the `created_by = auth.uid()` insert policy works for the backfill: migrations run as `postgres`, which bypasses RLS.

- [ ] **Step 3: Apply to the cloud project and check versions match**

Run: `pnpm db:push` (or Supabase MCP `apply_migration` with the file body, then rename the file so its version matches `list_migrations`).
Expected: applied; `pnpm supabase migration list --linked` shows the same version locally and remotely.

- [ ] **Step 4: Regenerate types, lint, advisors**

Run: `pnpm db:types && pnpm db:lint && pnpm typecheck`
Expected: `types.ts` contains `dataset_files`, `dataset_schema_versions`, `add_dataset_file`; lint clean; typecheck passes (the C02 `set_dataset_columns` call sites take named args `asset`, `columns` and still compile).
Then run Supabase MCP `get_advisors` (type `security`) and confirm no new findings for the new tables/functions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations src/lib/db/types.ts
git commit -m "feat(db): dataset files, schema history and the dataset-files bucket (C11)"
```

---

### Task 6: RLS and function tests

**Files:**

- Create: `tests/db/dataset-files.test.ts`

**Interfaces:**

- Consumes: `inject("fixtures")`, `createFixtureUser`, `deleteFixtureUsers` (`tests/db/fixtures.ts`); `asUser`, `createAdminClient`, `expectDenied`, `expectRows`, `TypedClient` (`tests/db/helpers.ts`); RPCs from Task 5.

- [ ] **Step 1: Write the tests**

```ts
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import {
  createFixtureUser,
  deleteFixtureUsers,
  type FixtureUser,
} from "./fixtures";
import {
  asUser,
  createAdminClient,
  expectDenied,
  expectRows,
  type TypedClient,
} from "./helpers";

const fx = inject("fixtures");
const { acme, globex } = fx.workspaces;
const admin = createAdminClient();

const BUCKET = "dataset-files";
const CSV = "order_id,amount\n1,9.5\n";
const INSUFFICIENT_PRIVILEGE = "42501";
const NO_DATA_FOUND = "P0002";

// M: acme member (creates the datasets). V: acme viewer. B: globex owner.
let m: FixtureUser;
let asM: TypedClient;
let v: TypedClient;
let b: TypedClient;
let datasetId: string;
const stored: string[] = [];

const qn = (name: string) => `files_${fx.runId}.${name}`;

const COLUMNS = [
  { name: "order_id", data_type: "bigint", description: "Key", is_pii: false },
  { name: "email", data_type: "text", description: "", is_pii: true },
];

function objectPath(
  assetId: string,
  fileId: string,
  name = "orders.csv",
  workspace = acme,
) {
  return `${workspace}/${assetId}/${fileId}/${name}`;
}

async function upload(client: TypedClient, path: string, body = CSV) {
  const result = await client.storage
    .from(BUCKET)
    .upload(path, new Blob([body], { type: "text/csv" }), {
      contentType: "text/csv",
    });
  if (!result.error) stored.push(path);
  return result;
}

/** Uploads a CSV as `client` and records it as the next file version. */
async function addFile(
  client: TypedClient,
  assetId: string,
  columns: typeof COLUMNS,
  filename = "orders.csv",
) {
  const fileId = randomUUID();
  const path = objectPath(assetId, fileId);
  const uploaded = await upload(client, path);
  if (uploaded.error) throw new Error(uploaded.error.message);
  return client.rpc("add_dataset_file", {
    asset: assetId,
    file_id: fileId,
    storage_path: path,
    filename,
    format: "csv",
    columns,
    row_count: 1,
  });
}

const history = (client: TypedClient, assetId: string) =>
  client
    .from("dataset_schema_versions")
    .select("version, source, file_id, columns")
    .eq("asset_id", assetId)
    .order("version");

async function newDataset(name: string, columns?: typeof COLUMNS) {
  const { data, error } = await asM.rpc("create_asset", {
    workspace: acme,
    kind: "dataset",
    name,
    qualified_name: qn(name),
    columns,
  });
  if (error) throw new Error(error.message);
  return data!.id;
}

beforeAll(async () => {
  m = await createFixtureUser(admin, "filem", fx.runId);
  const added = await admin
    .from("workspace_members")
    .insert({ workspace_id: acme, user_id: m.id, role: "member" as const });
  if (added.error) throw new Error(added.error.message);
  [asM, v, b] = await Promise.all([
    asUser(m),
    asUser(fx.users.v),
    asUser(fx.users.b),
  ]);
  datasetId = await newDataset("orders", COLUMNS);
});

afterAll(async () => {
  if (stored.length) await admin.storage.from(BUCKET).remove(stored);
  await deleteFixtureUsers(admin, [m.id]);
});

describe("schema history", () => {
  it("creating a dataset with columns records v1 as a manual change", async () => {
    const rows = await expectRows(history(asM, datasetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      source: "manual",
      file_id: null,
    });
    expect(rows[0]!.columns).toEqual(COLUMNS);
  });

  it("saving the same columns adds no version", async () => {
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: COLUMNS,
    });
    expect(error).toBeNull();
    expect(await expectRows(history(asM, datasetId))).toHaveLength(1);
  });

  it("changing a column records the next version", async () => {
    const changed = [{ ...COLUMNS[0]!, data_type: "text" }, COLUMNS[1]!];
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: changed,
    });
    expect(error).toBeNull();
    const rows = await expectRows(history(asM, datasetId));
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows[1]!.columns).toEqual(changed);
  });

  it("a dataset created without columns has no history", async () => {
    const id = await newDataset("empty");
    const { data, error } = await history(asM, id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a file change needs a file of the same dataset", async () => {
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: COLUMNS,
      source: "file",
    });
    expect(error?.code).toBe("22023");
  });
});

describe("dataset files", () => {
  it("records v1 with the size from Storage and a file snapshot", async () => {
    const id = await newDataset("from_file");
    const columns = [
      {
        name: "order_id",
        data_type: "INTEGER",
        description: "",
        is_pii: false,
      },
    ];
    const { data, error } = await addFile(
      asM,
      id,
      columns,
      "Ventas 2026 – ñ.csv",
    );
    expect(error).toBeNull();
    expect(data).toMatchObject({
      version: 1,
      size_bytes: new Blob([CSV]).size,
      filename: "Ventas 2026 – ñ.csv",
      format: "csv",
      uploaded_by: m.id,
    });
    const rows = await expectRows(history(asM, id));
    expect(rows).toEqual([
      { version: 1, source: "file", file_id: data!.id, columns },
    ]);
  });

  it("uploading again increments the file version; an identical schema adds no snapshot", async () => {
    const id = await newDataset("twice");
    const columns = [
      { name: "a", data_type: "INTEGER", description: "", is_pii: false },
    ];
    await addFile(asM, id, columns);
    const second = await addFile(asM, id, columns);
    expect(second.error).toBeNull();
    expect(second.data!.version).toBe(2);
    expect(await expectRows(history(asM, id))).toHaveLength(1);
  });

  it("fails when the object was never uploaded", async () => {
    const fileId = randomUUID();
    const { error } = await asM.rpc("add_dataset_file", {
      asset: datasetId,
      file_id: fileId,
      storage_path: objectPath(datasetId, fileId),
      filename: "orders.csv",
      format: "csv",
      columns: COLUMNS,
    });
    expect(error?.code).toBe(NO_DATA_FOUND);
  });

  it("a direct insert must also point at an uploaded object", async () => {
    const fileId = randomUUID();
    const { error } = await asM.from("dataset_files").insert({
      id: fileId,
      asset_id: datasetId,
      workspace_id: acme,
      version: 99,
      storage_path: objectPath(datasetId, fileId),
      filename: "orders.csv",
      format: "csv",
    });
    expect(error?.code).toBe(NO_DATA_FOUND);
  });
});

describe("access", () => {
  it("a viewer cannot upload or add a file", async () => {
    const fileId = randomUUID();
    const path = objectPath(datasetId, fileId);
    const uploaded = await upload(v, path);
    expect(uploaded.error).not.toBeNull();
    const { error } = await v.rpc("add_dataset_file", {
      asset: datasetId,
      file_id: fileId,
      storage_path: path,
      filename: "orders.csv",
      format: "csv",
      columns: COLUMNS,
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("a viewer reads files, history and objects", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    await expectRows(v.from("dataset_files").select("id").eq("id", data!.id));
    await expectRows(history(v, datasetId));
    const download = await v.storage.from(BUCKET).download(data!.storage_path);
    expect(download.error).toBeNull();
  });

  it("another workspace sees nothing and cannot upload", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    const files = await b
      .from("dataset_files")
      .select("id")
      .eq("asset_id", datasetId);
    expect(files.data).toEqual([]);
    const versions = await history(b, datasetId);
    expect(versions.data).toEqual([]);
    const download = await b.storage.from(BUCKET).download(data!.storage_path);
    expect(download.error).not.toBeNull();
    const uploaded = await upload(b, objectPath(datasetId, randomUUID()));
    expect(uploaded.error).not.toBeNull();
  });

  it("an object path must name the dataset's own workspace", async () => {
    const uploaded = await upload(
      asM,
      objectPath(datasetId, randomUUID(), "x.csv", globex),
    );
    expect(uploaded.error).not.toBeNull();
  });

  it("history and files are append-only for users", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    await expectDenied(
      asM
        .from("dataset_schema_versions")
        .update({ columns: [] })
        .eq("asset_id", datasetId)
        .select(),
    );
    await expectDenied(
      asM
        .from("dataset_schema_versions")
        .delete()
        .eq("asset_id", datasetId)
        .select(),
    );
    await expectDenied(
      asM
        .from("dataset_files")
        .update({ purged_at: new Date().toISOString() })
        .eq("id", data!.id)
        .select(),
    );
    await expectDenied(
      asM.from("dataset_files").delete().eq("id", data!.id).select(),
    );
  });

  it("stored objects cannot be overwritten or deleted by users", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    const overwrite = await asM.storage
      .from(BUCKET)
      .upload(data!.storage_path, new Blob(["x"], { type: "text/csv" }), {
        contentType: "text/csv",
        upsert: true,
      });
    expect(overwrite.error).not.toBeNull();
    const removed = await asM.storage.from(BUCKET).remove([data!.storage_path]);
    expect(removed.data ?? []).toEqual([]);
    const still = await asM.storage.from(BUCKET).download(data!.storage_path);
    expect(still.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run the DB tests**

Run: `pnpm test:db tests/db/dataset-files.test.ts`
Expected: PASS. If a policy or function behaves differently, fix the **migration** in a new migration file (the first one is already applied), regenerate types, and rerun.

- [ ] **Step 3: Run the whole DB suite (C02 regressions)**

Run: `pnpm test:db`
Expected: PASS, including `tests/db/assets.test.ts` (it calls `set_dataset_columns` with two named args).

- [ ] **Step 4: Commit**

```bash
git add tests/db/dataset-files.test.ts
git commit -m "test(db): RLS and history tests for dataset files (C11)"
```

---

### Task 7: Server reads, retention, server actions and delete cleanup

**Files:**

- Create: `src/lib/dataset-file/schema.ts`, `src/lib/dataset-file/server.ts`, `src/app/w/[workspace]/catalog/dataset-file-actions.ts`
- Modify: `src/app/w/[workspace]/catalog/actions.ts` (`deleteAsset`)
- Test: `src/lib/dataset-file/schema.test.ts`

**Interfaces:**

- Consumes: `columnsSchema`, `columnsPayload`, `ColumnInput` (`@/lib/asset/schema`); `requireUser` (`@/lib/profile/server`); `createServiceClient` (`@/lib/supabase/service`); Task 1 constants and `filesToPurge`; `ActionResult` (`catalog/actions.ts`).
- Produces:
  - `prepareUploadSchema`, `commitUploadSchema`, `fileRefSchema`, `snapshotColumns(value: unknown): ColumnInput[]`
  - `type DatasetFile = { id: string; version: number; filename: string; format: DatasetFileFormat; sizeBytes: number; rowCount: number | null; uploadedAt: string; purgedAt: string | null; uploader: { name: string | null; handle: string | null } | null }`
  - `type SchemaVersion = { id: string; version: number; source: "manual" | "file"; columns: ColumnInput[]; createdAt: string; author: { name: string | null; handle: string | null } | null; file: { filename: string; version: number } | null }`
  - `listDatasetFiles(assetId): Promise<DatasetFile[]>` (newest first), `listSchemaVersions(assetId): Promise<SchemaVersion[]>` (newest first)
  - `purgeOldDatasetFiles(workspaceId, assetId): Promise<void>`, `removeStoredFiles(workspaceId, paths): Promise<void>`
  - Server actions: `prepareDatasetFileUpload(raw): Promise<{ ok: true; upload: PreparedUpload } | { ok: false; message: string }>` with `PreparedUpload = { fileId: string; path: string; signedUrl: string; contentType: string }`; `commitDatasetFile(raw): Promise<ActionResult>`; `getDatasetFileDownloadUrl(raw): Promise<{ ok: true; url: string } | { ok: false; message: string }>`

- [ ] **Step 1: Write the failing schema tests**

```ts
import { describe, expect, it } from "vitest";

import {
  commitUploadSchema,
  prepareUploadSchema,
  snapshotColumns,
} from "./schema";

const id = "3f1c8a5e-6b1d-4c3a-9e2f-1a2b3c4d5e6f";

describe("prepareUploadSchema", () => {
  it("accepts a valid request", () => {
    expect(
      prepareUploadSchema.safeParse({
        assetId: id,
        filename: "a.csv",
        format: "csv",
        sizeBytes: 10,
      }).success,
    ).toBe(true);
  });
  it("rejects too-large files, slashes in names and unknown formats", () => {
    const base = {
      assetId: id,
      filename: "a.csv",
      format: "csv",
      sizeBytes: 10,
    };
    expect(
      prepareUploadSchema.safeParse({ ...base, sizeBytes: 52428801 }).success,
    ).toBe(false);
    expect(
      prepareUploadSchema.safeParse({ ...base, filename: "a/b.csv" }).success,
    ).toBe(false);
    expect(
      prepareUploadSchema.safeParse({ ...base, format: "json" }).success,
    ).toBe(false);
  });
});

describe("commitUploadSchema", () => {
  it("validates the columns like the asset form", () => {
    const result = commitUploadSchema.safeParse({
      assetId: id,
      fileId: id,
      path: `${id}/${id}/${id}/a.csv`,
      filename: "a.csv",
      format: "csv",
      rowCount: null,
      columns: [
        { name: "a", dataType: "", description: "", isPii: false },
        { name: "A", dataType: "", description: "", isPii: false },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("snapshotColumns", () => {
  it("maps a stored snapshot to column inputs", () => {
    expect(
      snapshotColumns([
        { name: "a", data_type: "INT64", description: "", is_pii: true },
      ]),
    ).toEqual([{ name: "a", dataType: "INT64", description: "", isPii: true }]);
  });
  it("returns no columns for malformed data", () => {
    expect(snapshotColumns({ nope: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/lib/dataset-file/schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `schema.ts`**

```ts
import { z } from "zod";

import { columnsSchema, type ColumnInput } from "@/lib/asset/schema";

import { DATASET_FILE_FORMATS, MAX_FILE_BYTES } from "./limits";

const filenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !name.includes("/"), {
    error: "File names cannot contain /.",
  });

export const prepareUploadSchema = z.object({
  assetId: z.uuid(),
  filename: filenameSchema,
  format: z.enum(DATASET_FILE_FORMATS),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(MAX_FILE_BYTES, { error: "Files can be at most 50 MB." }),
});

export const commitUploadSchema = z.object({
  assetId: z.uuid(),
  fileId: z.uuid(),
  path: z.string().min(1).max(1024),
  filename: filenameSchema,
  format: z.enum(DATASET_FILE_FORMATS),
  rowCount: z.number().int().min(0).nullable(),
  columns: columnsSchema,
});

export const fileRefSchema = z.object({ fileId: z.uuid() });

const snapshotColumn = z.object({
  name: z.string(),
  data_type: z.string().default(""),
  description: z.string().default(""),
  is_pii: z.boolean().default(false),
});

/** A `dataset_schema_versions.columns` value as column inputs. */
export function snapshotColumns(value: unknown): ColumnInput[] {
  const parsed = z.array(snapshotColumn).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((column) => ({
    name: column.name,
    dataType: column.data_type,
    description: column.description,
    isPii: column.is_pii,
  }));
}
```

- [ ] **Step 4: Implement `server.ts`**

```ts
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
```

If the generated types type the embedded `profiles` or `dataset_files` as arrays, add `!fk_name` hints to the select (e.g. `profiles!dataset_files_uploaded_by_fkey(...)`) — check `src/lib/db/types.ts` relationships.

- [ ] **Step 5: Implement the server actions**

`src/app/w/[workspace]/catalog/dataset-file-actions.ts`:

```ts
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
```

- [ ] **Step 6: Remove stored files when a dataset is deleted**

In `src/app/w/[workspace]/catalog/actions.ts`, add the import and change `deleteAsset`:

```ts
import { removeStoredFiles } from "@/lib/dataset-file/server";
```

```ts
const { supabase } = await requireUser();
// Read the stored files first: their rows cascade with the asset.
const files = await supabase
  .from("dataset_files")
  .select("workspace_id, storage_path")
  .eq("asset_id", input.data.assetId);
const { data, error } = await supabase
  .from("entities")
  .delete()
  .eq("id", input.data.assetId)
  .eq("type", "asset")
  .select("id");
if (error || data.length === 0) {
  return {
    ok: false,
    message: "Only the asset's owner or a workspace admin can delete it.",
  };
}
const stored = files.data ?? [];
if (stored.length) {
  await removeStoredFiles(
    stored[0]!.workspace_id,
    stored.map((f) => f.storage_path),
  );
}
```

- [ ] **Step 7: Run unit tests and typecheck**

Run: `pnpm vitest run --project unit src/lib/dataset-file && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dataset-file "src/app/w/[workspace]/catalog/dataset-file-actions.ts" "src/app/w/[workspace]/catalog/actions.ts"
git commit -m "feat(catalog): server actions for dataset file uploads, downloads and retention (C11)"
```

---

### Task 8: Upload client, file picker and progress bar

**Files:**

- Create: `src/lib/dataset-file/upload.ts`, `src/app/w/[workspace]/catalog/upload-dataset-file.ts`, `src/components/asset/dataset-file-picker.tsx`, `src/components/asset/upload-progress.tsx`
- Test: `src/components/asset/dataset-file-picker.test.tsx`

**Interfaces:**

- Consumes: `parseDatasetFile`, `ParsedDatasetFile` (Task 4); `ACCEPT` (Task 1); server actions (Task 7).
- Produces: `putFile(url, file: Blob, contentType, onProgress?): Promise<void>`; `uploadDatasetFile({ assetId, parsed, columns, onProgress? }): Promise<ActionResult>`; `<DatasetFilePicker onParsed(parsed) label? disabled? />`; `<UploadProgress value={0..1} label />`.

- [ ] **Step 1: Write the failing picker test**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatasetFilePicker } from "./dataset-file-picker";

describe("DatasetFilePicker", () => {
  it("parses a chosen CSV and hands it over", async () => {
    const onParsed = vi.fn();
    render(<DatasetFilePicker onParsed={onParsed} />);
    const input = screen.getByLabelText("Choose a CSV or Parquet file");
    const file = new File(["id,amount\n1,2.5\n"], "orders.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1));
    expect(onParsed.mock.calls[0]![0]).toMatchObject({
      format: "csv",
      rowCount: 1,
      columns: [
        { name: "id", dataType: "INTEGER" },
        { name: "amount", dataType: "DECIMAL" },
      ],
    });
  });

  it("shows why a file was rejected", async () => {
    const onParsed = vi.fn();
    render(<DatasetFilePicker onParsed={onParsed} />);
    fireEvent.change(screen.getByLabelText("Choose a CSV or Parquet file"), {
      target: { files: [new File(["x"], "notes.txt")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a .csv or .parquet file.",
    );
    expect(onParsed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/components/asset/dataset-file-picker.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `upload.ts`**

```ts
/**
 * PUTs `file` to a Storage signed upload URL, reporting progress (fetch cannot
 * report upload progress, so this uses XHR).
 */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`The upload failed (${xhr.status}). Try again.`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error("The upload failed. Check your connection and try again."),
      );
    xhr.send(file);
  });
}
```

- [ ] **Step 4: Implement `upload-dataset-file.ts`**

```ts
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
```

- [ ] **Step 5: Implement `upload-progress.tsx`**

```tsx
/** A determinate progress bar with a visible label. */
export function UploadProgress({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <p className="text-sm">
        {label} {percent}%
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `dataset-file-picker.tsx`**

```tsx
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
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run --project unit src/components/asset && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dataset-file/upload.ts "src/app/w/[workspace]/catalog/upload-dataset-file.ts" src/components/asset
git commit -m "feat(catalog): dataset file picker and direct-to-storage upload (C11)"
```

---

### Task 9: New dataset from a file

**Files:**

- Modify: `src/app/w/[workspace]/catalog/actions.ts` (`createAsset`), `src/app/w/[workspace]/catalog/asset-form.tsx`

**Interfaces:**

- Consumes: `DatasetFilePicker`, `UploadProgress` (Task 8); `uploadDatasetFile` (Task 8); `fileStem` (Task 1); `summarizeFile` (Task 1); `suggestQualifiedName`, `columnsSchema` (`@/lib/asset/schema`).
- Produces: `export type CreateAssetState = FormState | { status: "created"; assetId: string; href: string }`; `createAsset(previous: CreateAssetState, formData): Promise<CreateAssetState>` — when the form carries `withFile=1` and kind is `dataset`, it creates the dataset **without columns** and returns `created` instead of redirecting.

- [ ] **Step 1: Change `createAsset`**

In `actions.ts`:

```ts
/** `created`: a dataset whose file the browser uploads next (no redirect yet). */
export type CreateAssetState =
  FormState | { status: "created"; assetId: string; href: string };
```

```ts
export async function createAsset(
  _previous: CreateAssetState,
  formData: FormData,
): Promise<CreateAssetState> {
  // …existing parsing unchanged…
  const withFile =
    formData.get("withFile") === "1" && input.data.kind === "dataset";

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_asset", {
    // …existing args…
    columns:
      input.data.kind === "dataset" && !withFile
        ? columnsPayload(input.data.columns)
        : undefined,
  });
  const failed = writeError(error, input.data);
  if (failed) return failed;
  if (!data) return { status: "error", message: GENERIC_ERROR };

  refreshCatalog();
  const href = assetPath(ref.data.workspaceSlug, data.qualified_name);
  // The columns arrive with the file (`add_dataset_file`), as its v1 schema.
  if (withFile) return { status: "created", assetId: data.id, href };
  redirect(href);
}
```

- [ ] **Step 2: Change `AssetForm`**

Add imports:

```ts
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DatasetFilePicker } from "@/components/asset/dataset-file-picker";
import { UploadProgress } from "@/components/asset/upload-progress";
import { columnsSchema } from "@/lib/asset/schema";
import { summarizeFile } from "@/lib/dataset-file/format";
import { fileStem } from "@/lib/dataset-file/limits";
import type { ParsedDatasetFile } from "@/lib/dataset-file/parse";

import { createAsset, updateAsset, type CreateAssetState } from "./actions";
import { uploadDatasetFile } from "./upload-dataset-file";
```

Replace the `useActionState` block and add the file state:

```tsx
const router = useRouter();
const submittedColumns = useRef<ColumnInput[]>([]);
const uploadStarted = useRef<string | null>(null);
const [file, setFile] = useState<ParsedDatasetFile | null>(null);
const [columnsKey, setColumnsKey] = useState(0);
const [uploadProgress, setUploadProgress] = useState<number | null>(null);

const [state, action] = useActionState(
  async (previous: CreateAssetState, formData: FormData) => {
    if (editing) return updateAsset({ status: "idle" }, formData);
    const raw = formData.get("columns");
    const parsed = columnsSchema.safeParse(
      typeof raw === "string" && raw ? JSON.parse(raw) : [],
    );
    submittedColumns.current = parsed.success ? parsed.data : [];
    return createAsset(previous, formData);
  },
  idle as CreateAssetState,
);

// A dataset created from a file: upload it, then open the dataset.
useEffect(() => {
  if (state.status !== "created" || !file) return;
  if (uploadStarted.current === state.assetId) return;
  uploadStarted.current = state.assetId;
  setUploadProgress(0);
  void uploadDatasetFile({
    assetId: state.assetId,
    parsed: file,
    columns: submittedColumns.current,
    onProgress: setUploadProgress,
  }).then((result) => {
    if (result.ok) {
      router.push(state.href);
      return;
    }
    toast.error(
      `The dataset was added, but the file did not upload: ${result.message} Upload it again from the Files tab.`,
    );
    router.push(`${state.href}?tab=files`);
  });
}, [state, file, router]);

function attach(parsed: ParsedDatasetFile) {
  const stem = fileStem(parsed.file.name);
  setFile(parsed);
  setColumnsKey((k) => k + 1);
  if (!name.trim()) setName(stem);
  if (!qualifiedNameEdited) {
    const table = suggestQualifiedName(stem).replaceAll(".", "_") || "dataset";
    setQualifiedName(`files.${table}`);
  }
}
```

`JSON.parse` can throw on a malformed hidden input; wrap it: `(() => { try { return JSON.parse(raw) } catch { return [] } })()`.

Render — right after the kind `fieldset` (inside `{!editing && …}` region, only for datasets):

```tsx
{
  !editing && kind === "dataset" && (
    <section
      aria-labelledby="asset-file-heading"
      className="flex flex-col gap-2"
    >
      <h2 id="asset-file-heading" className="text-sm font-medium">
        Start from a file{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </h2>
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-sm">
            {summarizeFile({
              filename: file.file.name,
              sizeBytes: file.file.size,
              rowCount: file.rowCount,
              columnCount: file.columns.length,
            })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploadProgress !== null}
            onClick={() => {
              setFile(null);
              setColumnsKey((k) => k + 1);
            }}
          >
            Remove file
          </Button>
        </div>
      ) : (
        <DatasetFilePicker onParsed={attach} />
      )}
      {file && <input type="hidden" name="withFile" value="1" />}
    </section>
  );
}
```

Change the columns editor line:

```tsx
{
  kind === "dataset" && (
    <ColumnsEditor
      key={columnsKey}
      defaultValue={file ? file.columns : initial.columns}
      errors={errors}
    />
  );
}
```

Above the submit row:

```tsx
{
  uploadProgress !== null && file && (
    <UploadProgress
      value={uploadProgress}
      label={`Uploading ${file.file.name}…`}
    />
  );
}
```

And disable the submit button while uploading: `<SubmitButton disabled={uploadProgress !== null} …>`.

The `state.status === "error"` checks elsewhere in the form keep working with the union.

- [ ] **Step 3: Typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 4: Manual smoke check**

Run `pnpm dev`, open `/w/<slug>/catalog/new`, drop a small CSV: name, qualified name and columns fill in; submit; you land on the dataset. Check dark mode and keyboard (Tab reaches the file button; Space opens the dialog).

- [ ] **Step 5: Commit**

```bash
git add "src/app/w/[workspace]/catalog/actions.ts" "src/app/w/[workspace]/catalog/asset-form.tsx"
git commit -m "feat(catalog): create a dataset from a CSV or Parquet file (C11)"
```

---

### Task 10: Upload a new version with schema review

**Files:**

- Create (shadcn): `src/components/ui/dialog.tsx` via `pnpm dlx shadcn@latest add dialog`
- Create: `src/components/asset/schema-diff-list.tsx`, `src/app/w/[workspace]/catalog/[asset]/schema-review.tsx`, `src/app/w/[workspace]/catalog/[asset]/upload-version.tsx`
- Test: `src/app/w/[workspace]/catalog/[asset]/schema-review.test.tsx`

**Interfaces:**

- Consumes: `diffSchemas`, `mergeCarryOver`, `SchemaDiff` (Task 2); `DatasetFilePicker`, `UploadProgress`, `uploadDatasetFile` (Task 8); `summarizeFile` (Task 1).
- Produces: `<SchemaDiffList diff={SchemaDiff} />` (no hooks; usable from server components); `<SchemaReview current proposed onChange />`; `<UploadVersion assetId currentColumns />`.

- [ ] **Step 1: Add the dialog component**

Run: `pnpm dlx shadcn@latest add dialog`
Expected: `src/components/ui/dialog.tsx` created.

- [ ] **Step 2: Write the failing review test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ColumnInput } from "@/lib/asset/schema";

import { SchemaReview } from "./schema-review";

const col = (
  name: string,
  dataType: string,
  extra: Partial<ColumnInput> = {},
): ColumnInput => ({
  name,
  dataType,
  description: "",
  isPii: false,
  ...extra,
});

describe("SchemaReview", () => {
  const current = [
    col("id", "INTEGER"),
    col("legacy", "STRING", { description: "Old flag" }),
  ];
  const proposed = [col("id", "INT64"), col("email", "STRING")];

  it("summarises the changes and warns about documented removed columns", () => {
    render(
      <SchemaReview
        current={current}
        proposed={proposed}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("1 added")).toBeInTheDocument();
    expect(screen.getByText("1 removed")).toBeInTheDocument();
    expect(screen.getByText("1 type change")).toBeInTheDocument();
    expect(screen.getByText(/legacy/)).toBeInTheDocument();
    expect(
      screen.getByText(/its description will be lost/),
    ).toBeInTheDocument();
    expect(screen.getByText("INTEGER → INT64")).toBeInTheDocument();
  });

  it("edits descriptions and PII flags of the proposed columns", () => {
    const onChange = vi.fn();
    render(
      <SchemaReview
        current={current}
        proposed={proposed}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("email holds PII"));
    expect(onChange).toHaveBeenLastCalledWith([
      col("id", "INT64"),
      col("email", "STRING", { isPii: true }),
    ]);
    fireEvent.change(screen.getByLabelText("Description of id"), {
      target: { value: "Key" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      col("id", "INT64", { description: "Key" }),
      col("email", "STRING"),
    ]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run --project unit "src/app/w/[workspace]/catalog/[asset]/schema-review.test.tsx"`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `schema-diff-list.tsx`**

```tsx
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
```

The `SchemaReview` test expects the text `INTEGER → INT64` in one element — the inner `<span>` above renders exactly that.

- [ ] **Step 5: Implement `schema-review.tsx`**

```tsx
"use client";

import { SchemaDiffList } from "@/components/asset/schema-diff-list";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MAX_COLUMN_DESCRIPTION, type ColumnInput } from "@/lib/asset/schema";
import { diffSchemas } from "@/lib/dataset-file/schema-diff";

/** The diff against the current columns, and the new columns' docs to edit. */
export function SchemaReview({
  current,
  proposed,
  onChange,
}: {
  current: ColumnInput[];
  proposed: ColumnInput[];
  onChange: (next: ColumnInput[]) => void;
}) {
  const diff = diffSchemas(current, proposed);
  const added = new Set(diff.added.map((c) => c.name));
  const update = (index: number, patch: Partial<ColumnInput>) =>
    onChange(proposed.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const typeChanges = diff.typeChanged.length;

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Summary of changes"
        className="flex flex-wrap gap-2 text-sm"
      >
        <li>
          <Badge variant="secondary">{diff.added.length} added</Badge>
        </li>
        <li>
          <Badge variant="secondary">{diff.removed.length} removed</Badge>
        </li>
        <li>
          <Badge variant="secondary">
            {typeChanges} {typeChanges === 1 ? "type change" : "type changes"}
          </Badge>
        </li>
        <li>
          <Badge variant="outline">{diff.unchanged.length} unchanged</Badge>
        </li>
      </ul>
      {(diff.added.length > 0 ||
        diff.removed.length > 0 ||
        typeChanges > 0) && (
        <SchemaDiffList diff={{ ...diff, metaChanged: [] }} warnOnLoss />
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Columns after the upload
        </legend>
        <ol className="flex flex-col divide-y rounded-xl border">
          {proposed.map((column, index) => (
            <li
              key={column.name}
              className="grid gap-2 p-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{column.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {column.dataType || "—"}
                </span>
                {added.has(column.name) && <Badge>New</Badge>}
              </span>
              <Input
                aria-label={`Description of ${column.name}`}
                value={column.description}
                maxLength={MAX_COLUMN_DESCRIPTION}
                placeholder="Description"
                onChange={(event) =>
                  update(index, { description: event.target.value })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-label={`${column.name} holds PII`}
                  checked={column.isPii}
                  onCheckedChange={(checked) =>
                    update(index, { isPii: checked === true })
                  }
                />
                PII
              </label>
            </li>
          ))}
        </ol>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 6: Implement `upload-version.tsx`**

```tsx
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
            The file becomes the dataset's current file and its columns replace
            the current ones. Descriptions and PII flags carry over by column
            name.
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
```

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `pnpm vitest run --project unit "src/app/w/[workspace]/catalog" src/components && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components "src/app/w/[workspace]/catalog/[asset]"
git commit -m "feat(catalog): upload a new dataset file version with a schema review (C11)"
```

---

### Task 11: Files and History tabs

**Files:**

- Create: `src/app/w/[workspace]/catalog/[asset]/download-file-button.tsx`, `src/app/w/[workspace]/catalog/[asset]/files-tab.tsx`, `src/app/w/[workspace]/catalog/[asset]/history-tab.tsx`
- Modify: `src/app/w/[workspace]/catalog/[asset]/page.tsx`

**Interfaces:**

- Consumes: `listDatasetFiles`, `listSchemaVersions`, `DatasetFile`, `SchemaVersion` (Task 7); `getDatasetFileDownloadUrl` (Task 7); `UploadVersion`, `SchemaDiffList` (Task 10); `diffSchemas`, `describeDiff` (Task 2); `formatBytes`, `formatTimestamp` (Task 1); `getDatasetColumns` (`@/lib/asset/server`).
- Produces: `<FilesTab assetId canEdit currentColumns />`, `<HistoryTab assetId />`, `<DownloadFileButton fileId filename />`.

- [ ] **Step 1: Implement `download-file-button.tsx`**

```tsx
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
```

- [ ] **Step 2: Implement `files-tab.tsx`**

```tsx
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
```

- [ ] **Step 3: Implement `history-tab.tsx`**

```tsx
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
```

- [ ] **Step 4: Wire the tabs into the asset page**

In `page.tsx`:

```ts
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "columns", label: "Columns" },
  { id: "files", label: "Files" },
  { id: "history", label: "History" },
  { id: "lineage", label: "Lineage" },
  { id: "docs", label: "Docs & mentions" },
  { id: "discussion", label: "Discussion" },
] as const;

const DATASET_ONLY: readonly TabId[] = ["columns", "files", "history"];
```

```ts
const tabs = TABS.filter(
  (t) => !DATASET_ONLY.includes(t.id) || asset.kind === "dataset",
);
```

Render:

```tsx
{
  tab === "columns" && <Columns assetId={asset.id} canEdit={canEdit} />;
}
{
  tab === "files" && (
    <FilesTab
      assetId={asset.id}
      canEdit={canEdit}
      currentColumns={toColumnInputs(await getDatasetColumns(asset.id))}
    />
  );
}
{
  tab === "history" && <HistoryTab assetId={asset.id} />;
}
```

Add the helper at the bottom of the file:

```ts
function toColumnInputs(columns: DatasetColumn[]): ColumnInput[] {
  return columns.map(({ name, dataType, description, isPii }) => ({
    name,
    dataType,
    description,
    isPii,
  }));
}
```

Change `Columns` to take `canEdit`, show the upload button, and mention files in its empty state:

```tsx
async function Columns({ assetId, canEdit }: { assetId: string; canEdit: boolean }) {
  const columns = await getDatasetColumns(assetId);
  const upload = canEdit ? (
    <UploadVersion assetId={assetId} currentColumns={toColumnInputs(columns)} />
  ) : null;
  if (columns.length === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="No columns documented"
        description="Add the dataset's columns from Edit asset, or upload a CSV or Parquet file."
        action={upload}
      />
    );
  }
  // …existing header row: add {upload} at the end of the flex row with `ml-auto` wrapper…
```

Imports to add: `FilesTab`, `HistoryTab`, `UploadVersion`, `type DatasetColumn` from `@/lib/asset/server`, `type ColumnInput` from `@/lib/asset/schema`.

- [ ] **Step 5: Typecheck, lint, tests, build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/w/[workspace]/catalog/[asset]"
git commit -m "feat(catalog): Files and History tabs on datasets (C11)"
```

---

### Task 12: End-to-end test

**Files:**

- Create: `tests/e2e/dataset-files.spec.ts`

**Interfaces:**

- Consumes: `test`, `expect` (`tests/e2e/support/auth.ts`); `createWorkspace` (`tests/e2e/support/workspace.ts`); `parquetWriteBuffer` (`hyparquet-writer`).

- [ ] **Step 1: Write the test**

```ts
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { parquetWriteBuffer } from "hyparquet-writer";

import { expect, test } from "./support/auth";
import { createWorkspace } from "./support/workspace";

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target.join(" ")),
    }));
}

const CSV = "order_id,amount,email\n1,9,a@example.com\n2,12,b@example.com\n";

const PARQUET = Buffer.from(
  parquetWriteBuffer({
    columnData: [
      { name: "order_id", data: [1n, 2n], type: "INT64" },
      { name: "amount", data: [9.5, 12], type: "DOUBLE" },
      {
        name: "email",
        data: ["a@example.com", "b@example.com"],
        type: "STRING",
      },
      { name: "shipped", data: [true, false], type: "BOOLEAN" },
    ],
  }),
);

test.describe("dataset files", () => {
  test("create a dataset from a CSV, upload a Parquet version, review history and download", async ({
    page,
    admin,
    user,
    signIn,
  }) => {
    const slug = await createWorkspace(admin, user, "Files Co");
    const { data: ws } = await admin
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .single();

    try {
      await signIn(user, `/w/${slug}/catalog/new`);

      // Start from a CSV: name, qualified name and typed columns fill in.
      await page.getByLabel("Choose a CSV or Parquet file").setInputFiles({
        name: "orders.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(CSV),
      });
      await expect(
        page.getByText(/orders\.csv · .* · 2 rows · 3 columns/),
      ).toBeVisible();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "orders",
      );
      await expect(page.getByLabel("Qualified name")).toHaveValue(
        "files.orders",
      );
      await expect(page.getByLabel("Column 2 type")).toHaveValue("INTEGER");
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByLabel("Column 3 holds PII").check();
      await page.getByRole("button", { name: "Add to catalog" }).click();

      const assetUrl = `/w/${slug}/catalog/files.orders`;
      await expect(page).toHaveURL(assetUrl);
      const sections = page.getByRole("navigation", { name: "Asset sections" });

      // The Files tab shows the CSV as the current file.
      await sections.getByRole("link", { name: "Files" }).click();
      await expect(
        page.getByRole("heading", { name: "Current file" }),
      ).toBeVisible();
      await expect(page.getByText("orders.csv", { exact: true })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Upload a Parquet version and review the diff.
      await page.getByRole("button", { name: "Upload new version" }).click();
      const dialog = page.getByRole("dialog", { name: "Upload a new version" });
      await dialog.getByLabel("Choose a CSV or Parquet file").setInputFiles({
        name: "orders_v2.parquet",
        mimeType: "application/octet-stream",
        buffer: PARQUET,
      });
      await expect(dialog.getByText("1 added")).toBeVisible();
      await expect(dialog.getByText("INTEGER → DOUBLE")).toBeVisible();
      await expect(dialog.getByLabel("email holds PII")).toBeChecked();
      await dialog.getByRole("button", { name: "Confirm upload" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByText("orders_v2.parquet", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("row", { name: /orders\.csv/ }),
      ).toBeVisible();

      // The old file downloads under its original name.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download orders.csv" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("orders.csv");

      // History: v2 from the Parquet file, v1 from the CSV.
      await sections.getByRole("link", { name: "History" }).click();
      const versions = page.getByRole("list", { name: "Schema versions" });
      await expect(versions.getByText("from file")).toHaveCount(2);
      await versions.getByText("v2", { exact: true }).click();
      await expect(versions.getByText(/\+ shipped/)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // The PII flag survived the new version.
      await sections.getByRole("link", { name: "Columns" }).click();
      await expect(
        page.getByRole("row", { name: /email/ }).getByText("PII"),
      ).toBeVisible();
    } finally {
      // Storage objects do not cascade with the workspace.
      const { data: files } = await admin
        .from("dataset_files")
        .select("storage_path")
        .eq("workspace_id", ws!.id);
      if (files?.length) {
        await admin.storage
          .from("dataset-files")
          .remove(files.map((f) => f.storage_path));
      }
    }
  });
});
```

If `createWorkspace` already returns the id, use it instead of the lookup; if the `admin` fixture's type lacks the new tables, regenerate types (Task 5) first.

- [ ] **Step 2: Run the e2e test**

Run: `pnpm test:e2e tests/e2e/dataset-files.spec.ts`
Expected: PASS. If the direct `PUT` to the signed URL is rejected by Storage, switch `putFile` to send `FormData` (`form.append("cacheControl", "3600"); form.append("", file)`) — the same body `supabase-js`'s `uploadToSignedUrl` sends — and keep the XHR for progress.

- [ ] **Step 3: Run the whole e2e suite (catalog regressions)**

Run: `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/dataset-files.spec.ts
git commit -m "test(e2e): dataset file upload, versions, history and download (C11)"
```

---

### Task 13: Docs, roadmap and changelog

**Files:**

- Modify: `docs/specs/architecture.md` (Assets section), `docs/roadmap.md` (add C11), `CHANGELOG.md`

- [ ] **Step 1: Architecture doc**

Add after "### Assets (C02)":

```markdown
### Dataset files & schema history (C11)

- `dataset_files`: immutable file versions of a dataset (highest = current).
  Objects live in the private bucket `dataset-files` at
  `{workspace}/{asset}/{file}/{safe name}`; Storage RLS reuses
  `can_read_entity` / `can_write_entity` through `private.dataset_file_asset`.
  Users never update or delete objects: the service role purges objects
  beyond the newest 10 (`purged_at`) and removes them on dataset deletion.
- `dataset_schema_versions`: append-only snapshots of a dataset's columns,
  written by `set_dataset_columns` whenever the columns change (manual or
  `file`).
- Upload flow: browser parses (hyparquet footer / papaparse chunks) → server
  action returns a signed upload URL → browser PUTs to Storage →
  `add_dataset_file` RPC records the version and applies the reviewed
  columns. Files never pass through Next.js (body size limits).
```

- [ ] **Step 2: Roadmap entry**

Add after the C10 section in M1 (story C11, P1):

```markdown
#### C11 — Dataset files & schema history

**Depends on:** C02 · **Spec:** `docs/specs/c11-dataset-files.md`
**Goal:** attach CSV/Parquet files to datasets and track how their schema changes.

- [x] Migration: `dataset_files`, `dataset_schema_versions`, bucket `dataset-files` (50 MB, CSV/Parquet), RLS + Storage policies.
- [x] Schema read in the browser (Parquet footer, CSV type inference) on "New dataset" and "Upload new version" with a diff review.
- [x] Files tab (current + previous versions, download, retention of 10) and History tab (schema diffs, manual and file).
      **Acceptance:** uploading a new version shows added/removed/retyped columns before saving; descriptions and PII flags carry over; every column change is in the history; another workspace can neither read nor upload files.
```

- [ ] **Step 3: Changelog**

Under `## [Unreleased]` → `### Added`:

```markdown
- Dataset files & schema history (C11): upload a CSV or Parquet file (≤ 50 MB)
  to a dataset — or start a new dataset from one — and its schema is read in
  the browser into the dataset's columns (Parquet types from the footer, CSV
  types inferred). New versions are reviewed as a diff (added / removed /
  retyped) with descriptions and PII flags carried over. Files are stored in
  the private `dataset-files` bucket (10 newest kept per dataset) and every
  column change, typed or from a file, is recorded in a History tab.
```

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build && pnpm test:db && pnpm test:e2e`
Expected: all PASS. Run `pnpm format` first if `format:check` fails.

- [ ] **Step 5: Commit**

```bash
git add docs CHANGELOG.md
git commit -m "docs: dataset files and schema history (C11)"
```

- [ ] **Step 6: Open the PR**

Push the branch and open a PR titled `feat(catalog): dataset files & schema history (C11)` with `Closes #<issue>`, a summary, the decisions table from the spec, and the test evidence. No attribution lines.
