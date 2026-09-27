import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./support/auth";
import { createWorkspace } from "./support/workspace";

/** Every shell route, its `h1` and the heading of its empty state. */
const ROUTES = [
  { path: "home", title: "Shell Co", empty: "Nothing here yet" },
  { path: "projects", title: "Projects", empty: "No projects yet" },
  { path: "catalog", title: "Catalog", empty: "The catalog is empty" },
  { path: "docs", title: "Docs", empty: "No docs yet" },
  { path: "settings", title: "Settings", empty: "No general settings yet" },
] as const;

/** Serious and critical WCAG 2.1 A/AA violations on the current page. */
async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(" ")),
    }));
}

test.describe("app shell", () => {
  test("every route renders an empty state with no serious a11y violations", async ({
    page,
    admin,
    user,
    magicLinkPath,
  }) => {
    const slug = await createWorkspace(admin, user, "Shell Co");

    await page.goto(await magicLinkPath(user.email, `/w/${slug}`));
    await expect(page).toHaveURL(`/w/${slug}/home`);

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const route of ROUTES) {
        await page.goto(`/w/${slug}/${route.path}`);
        await expect(
          page.getByRole("heading", { level: 1, name: route.title }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: route.empty }),
        ).toBeVisible();
        expect(
          await seriousViolations(page),
          `${route.path} (${colorScheme})`,
        ).toEqual([]);
      }
    }
  });

  test("sidebar, breadcrumbs, theme and the in-shell 404", async ({
    page,
    admin,
    user,
    magicLinkPath,
  }) => {
    const slug = await createWorkspace(admin, user, "Nav Co");
    await page.goto(await magicLinkPath(user.email, `/w/${slug}/home`));

    // The sidebar lists the registry's features and marks the current one.
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await nav.getByRole("link", { name: "Catalog" }).click();
    await expect(page).toHaveURL(`/w/${slug}/catalog`);
    await expect(nav.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Breadcrumbs lead back up.
    await page.goto(`/w/${slug}/settings/members`);
    const crumbs = page.getByRole("navigation", { name: "breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Nav Co" })).toBeVisible();
    await crumbs.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(`/w/${slug}/settings`);

    // Theme toggle.
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    // Unknown pages keep the shell around the 404.
    await page.goto(`/w/${slug}/no-such-page`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(nav).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("keyboard: skip link and collapsing the sidebar", async ({
    page,
    admin,
    user,
    magicLinkPath,
  }) => {
    const slug = await createWorkspace(admin, user, "Keys Co");
    await page.goto(await magicLinkPath(user.email, `/w/${slug}/projects`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#content")).toBeFocused();

    // Ctrl+B collapses the sidebar to icons; the top bar button expands it.
    await page.keyboard.press("Control+b");
    await expect(
      page.locator('[data-slot="sidebar"][data-state="collapsed"]'),
    ).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Toggle Sidebar" })
      .click();
    await expect(
      page.locator('[data-slot="sidebar"][data-state="expanded"]'),
    ).toBeVisible();
  });

  test("tablet: the sidebar stays usable at 768px", async ({
    page,
    admin,
    user,
    magicLinkPath,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const slug = await createWorkspace(admin, user, "Tablet Co");
    await page.goto(await magicLinkPath(user.email, `/w/${slug}/home`));

    const nav = page.getByRole("navigation", { name: "Workspace" });
    await nav.getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(`/w/${slug}/docs`);
    expect(await seriousViolations(page)).toEqual([]);
  });
});
