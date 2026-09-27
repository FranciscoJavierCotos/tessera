"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Features every `DataTable` supports: client-side sorting. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumn<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData,
  // Columns of one table hold values of different types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/** Typed column helper for a `DataTable` of `TData` rows. */
export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

const NO_SORTING: SortingState = [];

/**
 * A sortable table (TanStack Table) with semantic markup: a caption for
 * screen readers, `aria-sort` on sorted headers and sort buttons that work
 * from the keyboard. With no rows it shows `emptyState` under the headers.
 * Keep `columns` and `data` stable (module scope or memoized).
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  caption,
  emptyState,
  initialSorting = NO_SORTING,
  getRowId,
  className,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  /** Describes the table for assistive tech (visually hidden). */
  caption: string;
  emptyState?: React.ReactNode;
  initialSorting?: SortingState;
  getRowId?: (row: TData, index: number) => string;
  className?: string;
}) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    initialState: { sorting: initialSorting },
  });
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div className={cn("rounded-xl border", className)}>
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : undefined
                    }
                    className="px-3"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? (
                          <ArrowUp aria-hidden className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <ArrowDown aria-hidden className="size-3.5" />
                        ) : (
                          <ArrowUpDown
                            aria-hidden
                            className="size-3.5 text-muted-foreground/60"
                          />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columnCount}
                className="p-4 whitespace-normal"
              >
                {emptyState ?? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nothing to show.
                  </p>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="px-3">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
