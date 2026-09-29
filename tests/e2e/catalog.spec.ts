import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { createDataset } from "./support/asset";
import { expect, test } from "./support/auth";
import { addWorkspaceMember, createProject } from "./support/project";
import { createWorkspace } from "./support/workspace";

/** Serious and critical WCAG 2.1 A/AA violations on the current page. */
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

test.describe("catalog", () => {
  test("register a dataset with columns, reject a duplicate, filter and edit", async ({
    page,
    admin,
    user,
    signIn,
  }) => {
    const slug = await createWorkspace(admin, user, "Catalog Co");
    await signIn(user, `/w/${slug}/catalog`);
    await expect(
      page.getByRole("heading", { name: "The catalog is empty" }),
    ).toBeVisible();

    // A dataset with two columns, one of them PII.
    await page.getByRole("link", { name: "Add asset" }).click();
    await expect(page).toHaveURL(`/w/${slug}/catalog/new`);
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel("Name", { exact: true }).fill("Orders");
    await page.getByLabel("Qualified name").fill("analytics.marts.fct_orders");
    await page.getByLabel("Description").fill("One row per **order**.");
    await page.getByLabel("Tags").fill("finance,");
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("Column 1 name").fill("order_id");
    await page.getByLabel("Column 1 type").fill("bigint");
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("Column 2 name").fill("email");
    await page.getByLabel("Column 2 type").fill("text");
    await page.getByLabel("Column 2 holds PII").check();
    await page.getByRole("button", { name: "Add to catalog" }).click();

    const assetUrl = `/w/${slug}/catalog/analytics.marts.fct_orders`;
    await expect(page).toHaveURL(assetUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: "Orders" }),
    ).toBeVisible();
    await expect(page.locator("strong", { hasText: "order" })).toBeVisible();
    await expect(page.getByText("#finance")).toBeVisible();

    // The Columns tab flags the PII column.
    await page
      .getByRole("navigation", { name: "Asset sections" })
      .getByRole("link", { name: "Columns" })
      .click();
    await expect(
      page.getByRole("heading", { name: "2 columns" }),
    ).toBeVisible();
    const emailRow = page.getByRole("row", { name: /email/ });
    await expect(emailRow.getByText("PII")).toBeVisible();
    await expect(
      page.getByRole("row", { name: /order_id/ }).getByText("PII"),
    ).toHaveCount(0);

    // The same qualified name (any case) is rejected with a clear message.
    await page.goto(`/w/${slug}/catalog/new`);
    await page.getByLabel("Name", { exact: true }).fill("Orders copy");
    await page.getByLabel("Qualified name").fill("ANALYTICS.marts.fct_orders");
    await page.getByRole("button", { name: "Add to catalog" }).click();
    await expect(
      page.getByText(
        "An asset named ANALYTICS.marts.fct_orders already exists in this workspace. Use another qualified name.",
      ),
    ).toBeVisible();

    // A dashboard; its qualified name follows the name.
    await page.getByLabel("Dashboard").check();
    await page.getByLabel("Name", { exact: true }).fill("Revenue Overview");
    await page.getByLabel("Qualified name").fill("");
    await page.getByLabel("Qualified name").fill("looker.revenue_overview");
    await page.getByLabel("Dashboard URL").fill("https://looker.example.com/1");
    await page.getByRole("combobox", { name: "Tool" }).click();
    await page.getByRole("option", { name: "Looker" }).click();
    await page.getByRole("button", { name: "Add to catalog" }).click();
    await expect(page).toHaveURL(`/w/${slug}/catalog/looker.revenue_overview`);
    await expect(page.getByText("Looker", { exact: true })).toBeVisible();

    // The list shows both and filters by kind.
    await page.goto(`/w/${slug}/catalog`);
    const table = page.getByRole("table", { name: "Catalog assets" });
    await expect(table.getByRole("link", { name: "Orders" })).toBeVisible();
    await expect(
      table.getByRole("link", { name: "Revenue Overview" }),
    ).toBeVisible();
    await expect(table.getByText("1 PII")).toBeVisible();
    await page.getByRole("combobox", { name: "Kind" }).click();
    await page.getByRole("option", { name: "Dashboards" }).click();
    await expect(page).toHaveURL(`/w/${slug}/catalog?kind=dashboard`);
    await expect(table.getByRole("link", { name: "Orders" })).toHaveCount(0);
    await expect(
      table.getByRole("link", { name: "Revenue Overview" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(`/w/${slug}/catalog`);
    await expect(table.getByRole("link", { name: "Orders" })).toBeVisible();
    await page.getByRole("combobox", { name: "Tag" }).click();
    await page.getByRole("option", { name: "#finance" }).click();
    await expect(table.getByRole("link", { name: "Orders" })).toBeVisible();
    await expect(
      table.getByRole("link", { name: "Revenue Overview" }),
    ).toHaveCount(0);

    // Edit: rename, unflag PII.
    await page.goto(assetUrl);
    await page.getByRole("link", { name: "Edit asset" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Orders (fact)");
    await page.getByLabel("Column 2 holds PII").uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(assetUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: "Orders (fact)" }),
    ).toBeVisible();
    await page.goto(`${assetUrl}?tab=columns`);
    await expect(page.getByText("PII")).toHaveCount(0);

    // Delete it.
    await page.goto(`${assetUrl}/edit`);
    await page.getByRole("button", { name: "Delete asset" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete asset" })
      .click();
    await expect(page).toHaveURL(`/w/${slug}/catalog`);
    await expect(
      table.getByRole("link", { name: "Orders (fact)" }),
    ).toHaveCount(0);
  });

  test("link an asset to a project and unlink it from the project home", async ({
    page,
    admin,
    user,
    signIn,
  }) => {
    const slug = await createWorkspace(admin, user, "Links Co");
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .single();
    const workspaceId = workspace!.id;
    await createDataset(admin, {
      workspaceId,
      owner: user,
      name: "Customers",
      qualifiedName: "analytics.marts.dim_customers",
    });
    const project = await createProject(admin, {
      workspaceId,
      lead: user,
      name: "Churn Model",
    });

    await signIn(user, `/w/${slug}/catalog/analytics.marts.dim_customers`);
    await expect(page.getByText("Not linked to any project.")).toBeVisible();
    await page.getByRole("combobox", { name: "Link to a project" }).click();
    await page.getByRole("option", { name: "Churn Model" }).click();
    await page.getByRole("button", { name: "Link project" }).click();
    await expect(
      page
        .getByRole("region", { name: "Projects" })
        .getByRole("link", { name: "Churn Model" }),
    ).toBeVisible();

    // The project home lists it; a project editor unlinks it.
    await page.goto(`/w/${slug}/projects/${project}`);
    const linked = page.getByRole("region", { name: "Linked assets" });
    await expect(linked.getByRole("link", { name: "Customers" })).toBeVisible();
    await linked.getByRole("button", { name: "Unlink Customers" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Unlink" })
      .click();
    await expect(
      linked.getByRole("heading", { name: "No linked assets" }),
    ).toBeVisible();
  });

  test("a workspace viewer browses the catalog read-only", async ({
    page,
    admin,
    user: owner,
    createUser,
    signIn,
  }) => {
    const viewer = await createUser({ onboarded: true });
    const slug = await createWorkspace(admin, owner, "Readers Co");
    const workspaceId = await addWorkspaceMember(admin, slug, viewer, "viewer");
    await createDataset(admin, {
      workspaceId,
      owner,
      name: "Payments",
      qualifiedName: "raw.stripe.payments",
      columns: [{ name: "card_last4", isPii: true }],
    });

    await signIn(viewer, `/w/${slug}/catalog`);
    await expect(
      page.getByRole("table", { name: "Catalog assets" }).getByRole("link", {
        name: "Payments",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Add asset" })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`/w/${slug}/catalog/raw.stripe.payments?tab=columns`);
    await expect(page.getByText("PII").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit asset" })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto(`/w/${slug}/catalog/raw.stripe.payments/edit`);
    await expect(
      page.getByRole("heading", {
        name: "You can view this asset but not edit it",
      }),
    ).toBeVisible();
  });
});
