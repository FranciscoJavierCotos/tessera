import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatasetFilePicker } from "./dataset-file-picker";

describe("DatasetFilePicker", () => {
  it("parses a chosen CSV and hands it over", async () => {
    const onParsed = vi.fn();
    render(<DatasetFilePicker onParsed={onParsed} />);
    const input = screen.getByLabelText("Choose a CSV or Parquet file");
    const file = new File(["id,amount\n1,2.5\n"], "orders.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1));
    expect(onParsed.mock.calls[0]![0]).toMatchObject({
      format: "csv",
      rowCount: 1,
      columns: [
        { name: "id", dataType: "INTEGER" },
        { name: "amount", dataType: "DECIMAL" },
      ],
    });
  });

  it("shows why a file was rejected", async () => {
    const onParsed = vi.fn();
    render(<DatasetFilePicker onParsed={onParsed} />);
    fireEvent.change(screen.getByLabelText("Choose a CSV or Parquet file"), {
      target: { files: [new File(["x"], "notes.txt")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a .csv or .parquet file.",
    );
    expect(onParsed).not.toHaveBeenCalled();
  });
});
