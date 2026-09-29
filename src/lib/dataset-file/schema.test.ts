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
