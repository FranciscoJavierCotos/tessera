import { expect, test, uniqueId } from "./support/auth";

test.describe("onboarding", () => {
  test("a new user cannot reach the app before onboarding", async ({
    page,
    newUser,
    signIn,
  }) => {
    await signIn(newUser);
    await expect(page).toHaveURL("/onboarding");

    await page.goto("/w");
    await expect(page).toHaveURL("/onboarding");

    await page.goto("/u/someone?tab=1");
    await expect(page).toHaveURL("/onboarding?next=%2Fu%2Fsomeone%3Ftab%3D1");
  });

  test("name → handle → discipline → create workspace", async ({
    page,
    newUser,
    signIn,
  }) => {
    const handle = `ada_${uniqueId()}`;
    const slug = `ada-${uniqueId()}`;
    await signIn(newUser);
    await expect(page).toHaveURL("/onboarding");

    // Step 1: the name comes prefilled from the auth metadata.
    const name = page.getByLabel("Display name");
    await expect(name).toHaveValue(newUser.displayName);
    await name.fill("Ada Lovelace");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: a handle is suggested from the name and checked live.
    const handleInput = page.getByLabel("Handle");
    await expect(handleInput).toHaveValue("ada_lovelace");
    await handleInput.fill("No");
    await expect(page.getByText("Use at least 3 characters.")).toBeVisible();
    await handleInput.fill(handle);
    await expect(page.getByText("Available")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: discipline.
    await page.getByRole("radio", { name: /Analytics engineer/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: no invites, so create a workspace.
    await expect(
      page.getByText("No pending invites for your email."),
    ).toBeVisible();
    await page.getByLabel("Workspace name").fill("Ada's Team");
    await expect(page.getByLabel("URL")).toHaveValue("ada-s-team");
    await page.getByLabel("URL").fill(slug);
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page).toHaveURL("/w");
    // Onboarded users skip onboarding from now on.
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/w");

    await page.getByRole("link", { name: "Your profile" }).click();
    await expect(page).toHaveURL(`/u/${handle}`);
    await expect(
      page.getByRole("heading", { name: "Ada Lovelace" }),
    ).toBeVisible();
    await expect(page.getByText("Analytics engineer")).toBeVisible();
  });

  test("a taken handle is rejected", async ({
    page,
    user,
    newUser,
    signIn,
  }) => {
    await signIn(newUser);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Handle").fill(user.handle!);
    await expect(page.getByText("Already taken")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("a pending invite lets the user join a workspace", async ({
    page,
    admin,
    user,
    newUser,
    signIn,
  }) => {
    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({
        name: "Invite Co",
        slug: `invite-${uniqueId()}`,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const invite = await admin.from("invites").insert({
      workspace_id: workspace.id,
      email: newUser.email,
      role: "member",
      token_hash: `e2e-${uniqueId()}`,
      invited_by: user.id,
    });
    if (invite.error) throw new Error(invite.error.message);

    await signIn(newUser, "/w?from=invite");
    await expect(page).toHaveURL("/onboarding?next=%2Fw%3Ffrom%3Dinvite");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Handle").fill(`joiner_${uniqueId()}`);
    await expect(page.getByText("Available")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: /Data analyst/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("As member · invited by")).toBeVisible();
    await page.getByRole("button", { name: "Join Invite Co" }).click();

    await expect(page).toHaveURL("/w?from=invite");
    const { data: members } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace.id)
      .eq("user_id", newUser.id);
    expect(members).toEqual([{ role: "member" }]);
  });
});
