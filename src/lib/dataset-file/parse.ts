import { checkFile, type DatasetFileFormat } from "./limits";
import { parseCsvFile } from "./parse-csv";
import { parseParquetFile } from "./parse-parquet";
import { DatasetFileError, type ParsedSchema } from "./types";

export type ParsedDatasetFile = ParsedSchema & {
  file: File;
  format: DatasetFileFormat;
};

export type ParseResult =
  { ok: true; parsed: ParsedDatasetFile } | { ok: false; message: string };

/** Checks and reads a file in the browser; never throws. */
export async function parseDatasetFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ParseResult> {
  const checked = checkFile(file);
  if (!checked.ok) return checked;
  try {
    const schema =
      checked.format === "csv"
        ? await parseCsvFile(file, onProgress)
        : await parseParquetFile(file);
    return { ok: true, parsed: { ...schema, file, format: checked.format } };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DatasetFileError
          ? error.message
          : "Could not read the file.",
    };
  }
}
