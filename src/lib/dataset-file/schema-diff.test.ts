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
