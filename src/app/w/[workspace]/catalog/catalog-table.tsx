"use client";

import { Database } from "lucide-react";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/states/empty-state";

export type CatalogAsset = {
  id: string;
  name: string;
  kind: string;
  owner: string | null;
  updated: string;
};

const column = dataTableColumns<CatalogAsset>();
const columns = [
  column.accessor("name", { header: "Name" }),
  column.accessor("kind", { header: "Kind" }),
  column.accessor("owner", {
    header: "Owner",
    cell: (info) => info.getValue() ?? "Unowned",
  }),
  column.accessor("updated", { header: "Updated" }),
];

function rowId(asset: CatalogAsset) {
  return asset.id;
}

export function CatalogTable({ assets }: { assets: CatalogAsset[] }) {
  return (
    <DataTable
      caption="Catalog assets"
      columns={columns}
      data={assets}
      getRowId={rowId}
      emptyState={
        <EmptyState
          icon={Database}
          title="The catalog is empty"
          description="Datasets, dashboards and other assets the team registers will be listed here."
          className="border-none"
        />
      }
    />
  );
}
