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
    const parsed = parseCsvText('\uFEFFid;amount;note\r\n1;2.5;"a;b"\r\n');
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
