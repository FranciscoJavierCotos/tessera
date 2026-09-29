import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { parquetWriteBuffer } from "hyparquet-writer";

import { expect, test } from "./support/auth";
import { createWorkspace } from "./support/workspace";

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target.join(" ")),
    }));
}

const CSV = "order_id,amount,email\n1,9,a@example.com\n2,12,b@example.com\n";

const PARQUET = Buffer.from(
  parquetWriteBuffer({
    columnData: [
      { name: "order_id", data: [1n, 2n], type: "INT64" },
      { name: "amount", data: [9.5, 12], type: "DOUBLE" },
      {
        name: "email",
        data: ["a@example.com", "b@example.com"],
        type: "STRING",
      },
      { name: "shipped", data: [true, false], type: "BOOLEAN" },
    ],
  }),
);

test.describe("dataset files", () => {
  test("create a dataset from a CSV, upload a Parquet version, review history and download", async ({
    page,
    admin,
    user,
    signIn,
  }) => {
    const slug = await createWorkspace(admin, user, "Files Co");
    const { data: ws } = await admin
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .single();

    try {
      await signIn(user, `/w/${slug}/catalog/new`);

      // Start from a CSV: name, qualified name and typed columns fill in.
      await page.getByLabel("Choose a CSV or Parquet file").setInputFiles({
        name: "orders.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(CSV),
      });
      await expect(
        page.getByText(/orders\.csv · .* · 2 rows · 3 columns/),
      ).toBeVisible();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "orders",
      );
      await expect(page.getByLabel("Qualified name")).toHaveValue(
        "files.orders",
      );
      await expect(page.getByLabel("Column 2 type")).toHaveValue("INTEGER");
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByLabel("Column 3 holds PII").check();
      await page.getByRole("button", { name: "Add to catalog" }).click();

      const assetUrl = `/w/${slug}/catalog/files.orders`;
      await expect(page).toHaveURL(assetUrl, { timeout: 30_000 });
      const sections = page.getByRole("navigation", { name: "Asset sections" });

      // The Files tab shows the CSV as the current file.
      await sections.getByRole("link", { name: "Files" }).click();
      await expect(
        page.getByRole("heading", { name: "Current file" }),
      ).toBeVisible();
      await expect(page.getByText("orders.csv", { exact: true })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Upload a Parquet version and review the diff.
      await page.getByRole("button", { name: "Upload new version" }).click();
      const dialog = page.getByRole("dialog", { name: "Upload a new version" });
      await dialog.getByLabel("Choose a CSV or Parquet file").setInputFiles({
        name: "orders_v2.parquet",
        mimeType: "application/octet-stream",
        buffer: PARQUET,
      });
      await expect(dialog.getByText("1 added")).toBeVisible();
      await expect(dialog.getByText("INTEGER → DOUBLE")).toBeVisible();
      await expect(dialog.getByLabel("email holds PII")).toBeChecked();
      await dialog.getByRole("button", { name: "Confirm upload" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByText("orders_v2.parquet", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("row", { name: /orders\.csv/ }),
      ).toBeVisible();

      // The old file downloads under its original name.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download orders.csv" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("orders.csv");

      // History: v2 from the Parquet file, v1 from the CSV.
      await sections.getByRole("link", { name: "History" }).click();
      const versions = page.getByRole("list", { name: "Schema versions" });
      await expect(versions.getByText("from file")).toHaveCount(2);
      await versions.getByText("v2", { exact: true }).click();
      await expect(versions.getByText(/\+ shipped/)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // The PII flag survived the new version.
      await sections.getByRole("link", { name: "Columns" }).click();
      await expect(
        page.getByRole("row", { name: /email/ }).getByText("PII"),
      ).toBeVisible();
    } finally {
      // Storage objects do not cascade with the workspace.
      const { data: files } = await admin
        .from("dataset_files")
        .select("storage_path")
        .eq("workspace_id", ws!.id);
      if (files?.length) {
        await admin.storage
          .from("dataset-files")
          .remove(files.map((f) => f.storage_path));
      }
    }
  });
});
