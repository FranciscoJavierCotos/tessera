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
