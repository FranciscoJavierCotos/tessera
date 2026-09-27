import { expect, test, uniqueId } from "./support/auth";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test.describe("profile", () => {
  test("the owner edits their profile", async ({
    page,
    admin,
    user,
    magicLinkPath,
  }) => {
    await page.goto(await magicLinkPath(user.email, `/u/${user.handle}`));
    await expect(page).toHaveURL(`/u/${user.handle}`);
    await expect(
      page.getByRole("heading", { name: "Owned assets" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent activity" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Edit profile" }).click();
    await expect(page).toHaveURL(`/u/${user.handle}/edit`);

    await page.locator("#avatar").setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();

    await page.getByLabel("Display name").fill("Grace Hopper");
    await page.getByLabel("Bio").fill("Compilers and COBOL.");
    const skills = page.getByRole("textbox", { name: "Skills" });
    await skills.fill("dbt");
    await skills.press("Enter");
    await skills.fill("SQL,");
    await page.getByRole("radio", { name: /Lead/ }).check();

    await page.getByRole("button", { name: "Add link" }).click();
    await page.getByLabel("Link 1 label").fill("Site");
    await page.getByLabel("Link 1 URL").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Enter a full http(s) URL.")).toBeVisible();
    // A failed save keeps what the user typed.
    await expect(page.getByLabel("Bio")).toHaveValue("Compilers and COBOL.");

    await page.getByLabel("Link 1 URL").fill("https://example.com/grace");
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page).toHaveURL(`/u/${user.handle}`);
    await expect(
      page.getByRole("heading", { name: "Grace Hopper" }),
    ).toBeVisible();
    await expect(page.getByText("Compilers and COBOL.")).toBeVisible();
    await expect(page.getByText("Lead", { exact: true })).toBeVisible();
    await expect(page.getByText("dbt", { exact: true })).toBeVisible();
    await expect(page.getByText("SQL", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Site/ })).toHaveAttribute(
      "href",
      "https://example.com/grace",
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .single();
    expect(profile?.avatar_path).toMatch(new RegExp(`^${user.id}/.+\\.png$`));
  });

  test("other people's profiles are read-only; strangers' are hidden", async ({
    page,
    admin,
    user,
    createUser,
    magicLinkPath,
  }) => {
    const peer = await createUser({ onboarded: true });
    const stranger = await createUser({ onboarded: true });
    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({
        name: "Shared",
        slug: `shared-${uniqueId()}`,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await admin
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: peer.id, role: "member" });

    await page.goto(await magicLinkPath(user.email, `/u/${peer.handle}`));
    await expect(
      page.getByRole("heading", { name: peer.displayName }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit profile" })).toHaveCount(
      0,
    );

    await page.goto(`/u/${peer.handle}/edit`);
    await expect(
      page.getByRole("heading", { name: "Profile not found" }),
    ).toBeVisible();

    await page.goto(`/u/${stranger.handle}`);
    await expect(
      page.getByRole("heading", { name: "Profile not found" }),
    ).toBeVisible();
  });
});
