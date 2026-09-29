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
