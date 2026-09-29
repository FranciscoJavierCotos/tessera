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
