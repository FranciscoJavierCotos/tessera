const UNITS = ["KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** `orders.parquet · 12.4 MB · 1,204,331 rows · 14 columns`. */
export function summarizeFile({
  filename,
  sizeBytes,
  rowCount,
  columnCount,
}: {
  filename: string;
  sizeBytes: number;
  rowCount: number | null;
  columnCount: number;
}): string {
  return [
    filename,
    formatBytes(sizeBytes),
    rowCount === null ? null : count(rowCount, "row", "rows"),
    count(columnCount, "column", "columns"),
  ]
    .filter(Boolean)
    .join(" · ");
}

const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** `29 Sept 2026, 14:05 UTC` (timestamps are stored in UTC). */
export function formatTimestamp(iso: string): string {
  return `${timestampFormat.format(new Date(iso))} UTC`;
}
