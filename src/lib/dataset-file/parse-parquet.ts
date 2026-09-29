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

  if (logical) {
    switch (logical.type) {
      case "DECIMAL":
        return `DECIMAL(${logical.precision},${logical.scale})`;
      case "TIMESTAMP":
      case "TIME":
        return `${logical.type}(${logical.unit}${logical.isAdjustedToUTC ? ", UTC" : ""})`;
      case "INTEGER":
        return `${logical.isSigned ? "INT" : "UINT"}${logical.bitWidth}`;
      default:
        return logical.type;
    }
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
