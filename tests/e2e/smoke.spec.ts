import { expect, test } from "@playwright/test";

test("landing page renders the product name", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: /tessera/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in" }).first(),
  ).toBeVisible();
});
