import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable, dataTableColumns } from "./data-table";

type Asset = { name: string; rows: number };

const helper = dataTableColumns<Asset>();
const columns = [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("rows", { header: "Rows", enableSorting: false }),
];
const data: Asset[] = [
  { name: "orders", rows: 3 },
  { name: "customers", rows: 1 },
  { name: "payments", rows: 2 },
];

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]!.textContent);
}

describe("DataTable", () => {
  it("renders a captioned table with a row per item", () => {
    render(<DataTable caption="Assets" columns={columns} data={data} />);
    expect(screen.getByRole("table", { name: "Assets" })).toBeInTheDocument();
    expect(names()).toEqual(["orders", "customers", "payments"]);
  });

  it("sorts by a column from its header button", () => {
    render(<DataTable caption="Assets" columns={columns} data={data} />);
    const header = screen.getByRole("columnheader", { name: /Name/ });

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["customers", "orders", "payments"]);

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(names()).toEqual(["payments", "orders", "customers"]);
  });

  it("does not offer sorting on columns that disable it", () => {
    render(<DataTable caption="Assets" columns={columns} data={data} />);
    const header = screen.getByRole("columnheader", { name: "Rows" });
    expect(within(header).queryByRole("button")).toBeNull();
  });

  it("shows the empty state when there are no rows", () => {
    render(
      <DataTable
        caption="Assets"
        columns={columns}
        data={[]}
        emptyState={<p>No assets yet</p>}
      />,
    );
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });
});
