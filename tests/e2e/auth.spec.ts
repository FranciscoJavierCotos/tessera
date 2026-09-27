import { expect, test } from "./support/auth";

test.describe("signed out", () => {
  test("protected routes redirect to sign-in with `next`", async ({ page }) => {
    await page.goto("/w/acme/home?tab=1");

    await expect(page).toHaveURL("/sign-in?next=%2Fw%2Facme%2Fhome%3Ftab%3D1");
    await expect(
      page.getByRole("heading", { name: "Sign in to Tessera" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
  });

  for (const path of ["/w", "/u/ada", "/onboarding"]) {
    test(`${path} requires a session`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/^[^?]*\/sign-in(\?|$)/);
    });
  }

  test("an expired link shows plain-language copy", async ({ page }) => {
    await page.goto(
      "/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    await expect(page).toHaveURL("/auth/error?code=link_expired");
    await expect(
      page.getByRole("heading", { name: "This sign-in link has expired" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to sign in" }),
    ).toBeVisible();
  });

  test("a cancelled GitHub consent shows plain-language copy", async ({
    page,
  }) => {
    await page.goto("/auth/callback?error=access_denied");

    await expect(
      page.getByRole("heading", { name: "GitHub sign-in was cancelled" }),
    ).toBeVisible();
  });

  test("a tampered link is rejected", async ({ page }) => {
    await page.goto(
      "/auth/callback?token_hash=not-a-real-token&type=magiclink",
    );

    await expect(page).toHaveURL(/\/auth\/error\?code=/);
    await expect(page).not.toHaveURL(/\/w/);
  });
});

test.describe("signed in", () => {
  test("a magic link signs the user in and lands on /w", async ({
    page,
    user,
    magicLinkPath,
  }) => {
    await page.goto(await magicLinkPath(user.email));

    await expect(page).toHaveURL("/w");
    await expect(
      page.getByRole("heading", { name: "Workspaces", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("You are not in a workspace yet"),
    ).toBeVisible();

    // Signed-in users skip the sign-in page.
    await page.goto("/sign-in");
    await expect(page).toHaveURL("/w");
  });

  test("the link honours a same-origin `next` and ignores others", async ({
    page,
    user,
    magicLinkPath,
  }) => {
    await page.goto(await magicLinkPath(user.email, "//evil.example/steal"));
    await expect(page).toHaveURL("/w");

    await page.goto(await magicLinkPath(user.email, "/w?from=link"));
    await expect(page).toHaveURL("/w?from=link");
  });

  test("sign out ends the session", async ({ page, user, magicLinkPath }) => {
    await page.goto(await magicLinkPath(user.email));
    await expect(page).toHaveURL("/w");

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL("/sign-in");
    await page.goto("/w");
    await expect(page).toHaveURL("/sign-in");
  });
});
