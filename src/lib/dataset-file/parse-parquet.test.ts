// @vitest-environment node
// (jsdom's TextEncoder returns Uint8Arrays from another realm, which hyparquet-writer rejects.)
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
