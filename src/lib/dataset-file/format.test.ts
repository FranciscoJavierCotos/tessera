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
