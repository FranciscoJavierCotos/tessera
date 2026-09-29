import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { createDataset } from "./support/asset";
import { expect, test } from "./support/auth";
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

test.describe("lineage", () => {
  test("add upstream and downstream assets, draw a cycle, navigate and remove", async ({
    page,
    admin,
    user,
    signIn,
  }) => {
    const slug = await createWorkspace(admin, user, "Lineage Co");
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .single();
    const workspaceId = workspace!.id;
    const dataset = (name: string, qualifiedName: string) =>
      createDataset(admin, { workspaceId, owner: user, name, qualifiedName });
    const raw = await dataset("Raw orders", "raw.shop.orders");
    await dataset("Staged orders", "analytics.staging.stg_orders");
    const mart = await dataset("Orders mart", "analytics.marts.fct_orders");

    const stgUrl = `/w/${slug}/catalog/analytics.staging.stg_orders`;
    await signIn(user, `${stgUrl}?tab=lineage`);
    await expect(
      page.getByRole("heading", { name: "No lineage yet" }),
    ).toBeVisible();

    // Upstream: raw → stg.
    await page.getByRole("button", { name: "Add upstream" }).click();
    const dialog = page.getByRole("dialog", { name: "Add an upstream asset" });
    await dialog.getByLabel("Search the catalog").fill("raw");
    await dialog.getByRole("radio", { name: /Raw orders/ }).check();
    expect(await seriousViolations(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Add connection" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Raw orders now feeds Staged orders"),
    ).toBeVisible();

    const upstream = page.getByRole("region", { name: /Upstream/ });
    await expect(
      upstream.getByRole("link", { name: "Raw orders" }),
    ).toBeVisible();

    // Downstream: stg → mart, as "Reads".
    await page.getByRole("button", { name: "Add downstream" }).click();
    const down = page.getByRole("dialog", { name: "Add a downstream asset" });
    await down.getByRole("radio", { name: /Orders mart/ }).check();
    await down.getByRole("combobox", { name: "Relation" }).click();
    await page.getByRole("option", { name: "Reads" }).click();
    await down.getByRole("button", { name: "Add connection" }).click();
    await expect(down).toBeHidden();
    const downstream = page.getByRole("region", { name: /Downstream/ });
    await expect(
      downstream.getByRole("link", { name: "Orders mart" }),
    ).toBeVisible();
    await expect(downstream.getByText("Reads")).toBeVisible();

    // The same connection twice is refused.
    await page.getByRole("button", { name: "Add upstream" }).click();
    const again = page.getByRole("dialog", { name: "Add an upstream asset" });
    await again.getByRole("radio", { name: /Raw orders/ }).check();
    await again.getByRole("button", { name: "Add connection" }).click();
    await expect(
      again.getByText("Those assets are already linked with that relation."),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // A cycle (mart → raw) still draws, with every asset once.
    const cycle = await admin.from("asset_edges").insert({
      workspace_id: workspaceId,
      from_asset: mart,
      to_asset: raw,
    });
    expect(cycle.error).toBeNull();
    await page.reload();
    const graph = page.getByTestId("rf__wrapper");
    await expect(graph.getByRole("link", { name: /Raw orders/ })).toHaveCount(
      1,
    );
    await expect(graph.getByRole("link", { name: /Orders mart/ })).toHaveCount(
      1,
    );
    await expect(
      graph.getByRole("link", { name: /Staged orders.*this asset/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(await seriousViolations(page)).toEqual([]);

    // Depth 1 → 2 changes the count.
    await page
      .getByRole("navigation", { name: "Depth" })
      .getByRole("link", { name: "Depth 1" })
      .click();
    await expect(page).toHaveURL(`${stgUrl}?tab=lineage&depth=1`);
    await expect(
      page.getByText("2 connected assets within 1 hop"),
    ).toBeVisible();

    // Clicking a node opens that asset's lineage.
    await graph.getByRole("link", { name: /Orders mart/ }).click();
    await expect(page).toHaveURL(
      `/w/${slug}/catalog/analytics.marts.fct_orders?tab=lineage`,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Orders mart" }),
    ).toBeVisible();

    // Remove the stg → mart connection from the mart's side.
    await page
      .getByRole("region", { name: /Upstream/ })
      .getByRole("button", { name: "Remove the link to Staged orders" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(
      page.getByText("Removed the link to Staged orders"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: /Upstream/ })
        .getByRole("link", { name: "Staged orders" }),
    ).toHaveCount(0);
  });

  test("a workspace viewer sees lineage but cannot change it", async ({
    page,
    admin,
    user: owner,
    createUser,
    signIn,
  }) => {
    const viewer = await createUser({ onboarded: true });
    const slug = await createWorkspace(admin, owner, "Readers Lineage");
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .single();
    const workspaceId = workspace!.id;
    const added = await admin.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: viewer.id,
      role: "viewer",
    });
    expect(added.error).toBeNull();
    const a = await createDataset(admin, {
      workspaceId,
      owner,
      name: "Events",
      qualifiedName: "raw.app.events",
    });
    const b = await createDataset(admin, {
      workspaceId,
      owner,
      name: "Sessions",
      qualifiedName: "analytics.marts.sessions",
    });
    const edge = await admin
      .from("asset_edges")
      .insert({ workspace_id: workspaceId, from_asset: a, to_asset: b });
    expect(edge.error).toBeNull();

    await signIn(viewer, `/w/${slug}/catalog/raw.app.events?tab=lineage`);
    await expect(
      page
        .getByRole("region", { name: /Downstream/ })
        .getByRole("link", { name: "Sessions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add upstream" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Remove the link/ }),
    ).toHaveCount(0);
  });
});
