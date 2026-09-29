import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ColumnInput } from "@/lib/asset/schema";

import { SchemaReview } from "./schema-review";

const col = (
  name: string,
  dataType: string,
  extra: Partial<ColumnInput> = {},
): ColumnInput => ({
  name,
  dataType,
  description: "",
  isPii: false,
  ...extra,
});

describe("SchemaReview", () => {
  const current = [
    col("id", "INTEGER"),
    col("legacy", "STRING", { description: "Old flag" }),
  ];
  const proposed = [col("id", "INT64"), col("email", "STRING")];

  it("summarises the changes and warns about documented removed columns", () => {
    render(
      <SchemaReview
        current={current}
        proposed={proposed}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("1 added")).toBeInTheDocument();
    expect(screen.getByText("1 removed")).toBeInTheDocument();
    expect(screen.getByText("1 type change")).toBeInTheDocument();
    expect(screen.getByText(/legacy/)).toBeInTheDocument();
    expect(
      screen.getByText(/its description will be lost/),
    ).toBeInTheDocument();
    expect(screen.getByText("INTEGER → INT64")).toBeInTheDocument();
  });

  it("edits descriptions and PII flags of the proposed columns", () => {
    const onChange = vi.fn();
    render(
      <SchemaReview
        current={current}
        proposed={proposed}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("email holds PII"));
    expect(onChange).toHaveBeenLastCalledWith([
      col("id", "INT64"),
      col("email", "STRING", { isPii: true }),
    ]);
    fireEvent.change(screen.getByLabelText("Description of id"), {
      target: { value: "Key" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      col("id", "INT64", { description: "Key" }),
      col("email", "STRING"),
    ]);
  });
});
