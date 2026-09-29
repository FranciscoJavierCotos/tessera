"use client";

import { Database } from "lucide-react";
import Link from "next/link";

import { KindBadge, PiiBadge, TagList } from "@/components/asset/asset-badges";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/states/empty-state";
import type { AssetKind } from "@/lib/asset/kinds";

export type CatalogAsset = {
  id: string;
  name: string;
  qualifiedName: string;
  href: string;
  kind: AssetKind;
  owner: string | null;
  tags: string[];
  /** Datasets only. */
  columns: number | null;
  piiColumns: number;
  /** `YYYY-MM-DD` (UTC). */
  updated: string;
};

const column = dataTableColumns<CatalogAsset>();
// The server sorts and paginates; columns are not sortable here.
const columns = [
  column.accessor("name", {
    header: "Name",
    enableSorting: false,
    cell: (info) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={info.row.original.href}
          className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {info.getValue()}
        </Link>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {info.row.original.qualifiedName}
        </span>
      </div>
    ),
  }),
  column.accessor("kind", {
    header: "Kind",
    enableSorting: false,
    cell: (info) => <KindBadge kind={info.getValue()} />,
  }),
  column.accessor("owner", {
    header: "Owner",
    enableSorting: false,
    cell: (info) => info.getValue() ?? "Unknown",
  }),
  column.accessor("tags", {
    header: "Tags",
    enableSorting: false,
    cell: (info) => (
      <TagList
        tags={info.getValue()}
        label={`Tags of ${info.row.original.name}`}
      />
    ),
  }),
  column.accessor("columns", {
    header: "Columns",
    enableSorting: false,
    cell: (info) =>
      info.getValue() === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="inline-flex items-center gap-2">
          {info.getValue()}
          {info.row.original.piiColumns > 0 && (
            <PiiBadge count={info.row.original.piiColumns} />
          )}
        </span>
      ),
  }),
  column.accessor("updated", { header: "Updated", enableSorting: false }),
];

function rowId(asset: CatalogAsset) {
  return asset.id;
}

export function CatalogTable({
  assets,
  emptyTitle = "No matching assets",
  emptyDescription = "Try other filters.",
}: {
  assets: CatalogAsset[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <DataTable
      caption="Catalog assets"
      columns={columns}
      data={assets}
      getRowId={rowId}
      emptyState={
        <EmptyState
          icon={Database}
          title={emptyTitle}
          description={emptyDescription}
          className="border-none"
        />
      }
    />
  );
}
