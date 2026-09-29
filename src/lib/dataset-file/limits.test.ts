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
