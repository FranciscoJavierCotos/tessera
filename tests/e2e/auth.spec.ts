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
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /email me a sign-in link/i }),
    ).toHaveCount(0);
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
    await page.goto("/auth/callback?token_hash=not-a-real-token&type=signup");

    await expect(page).toHaveURL(/\/auth\/error\?code=/);
    await expect(page).not.toHaveURL(/\/w/);
  });
});

test.describe("password sign-in", () => {
  test("a wrong password shows plain-language copy", async ({ page, user }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(user.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("Wrong email or password")).toBeVisible();
    await expect(page).toHaveURL("/sign-in");
    await expect(page.getByLabel("Work email")).toHaveValue(user.email);
  });

  test("the form switches to creating an account", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Create an account" }).click();

    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    await expect(page.getByText("At least 8 characters.")).toBeVisible();

    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });
});

test.describe("signed in", () => {
  test("email + password signs the user in and lands on /w", async ({
    page,
    user,
    signIn,
  }) => {
    await signIn(user);

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

  test("sign-in honours a same-origin `next` and ignores others", async ({
    page,
    user,
    signIn,
  }) => {
    await signIn(user, "//evil.example/steal");
    await expect(page).toHaveURL("/w");

    await page.context().clearCookies();
    await signIn(user, "/w?from=link");
    await expect(page).toHaveURL("/w?from=link");
  });

  test("sign out ends the session", async ({ page, user, signIn }) => {
    await signIn(user);
    await expect(page).toHaveURL("/w");

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL("/sign-in");
    await page.goto("/w");
    await expect(page).toHaveURL("/sign-in");
  });
});
