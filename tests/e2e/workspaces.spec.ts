import { expect, test, uniqueId, type TestUser } from "./support/auth";

type Admin = Parameters<Parameters<typeof test>[2]>[0]["admin"];

/** A workspace created by `owner` (the DB trigger makes them owner). */
async function createWorkspace(admin: Admin, owner: TestUser, name: string) {
  const slug = `e2e-${uniqueId()}`;
  const { error } = await admin
    .from("workspaces")
    .insert({ name, slug, created_by: owner.id });
  if (error) throw new Error(`workspace: ${error.message}`);
  return slug;
}

test.describe("workspaces", () => {
  test("an owner invites a teammate, who accepts; the owner manages them", async ({
    page,
    browser,
    admin,
    user: owner,
    createUser,
    magicLinkPath,
  }) => {
    const invitee = await createUser({ onboarded: true });
    const slug = await createWorkspace(admin, owner, "Invite Flow");
    const membersPath = `/w/${slug}/settings/members`;

    await page.goto(await magicLinkPath(owner.email, membersPath));
    await expect(page).toHaveURL(membersPath);
    await expect(page.getByRole("heading", { name: "1 member" })).toBeVisible();
    await expect(page.getByText("No pending invites.")).toBeVisible();

    await page.getByLabel("Email").fill(invitee.email);
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(
      page.getByText(`Invite sent to ${invitee.email}`),
    ).toBeVisible();
    const link = await page.getByLabel("Invite link").inputValue();
    await expect(
      page.getByRole("listitem").filter({ hasText: invitee.email }),
    ).toBeVisible();

    // The invitee opens the link in their own session.
    const context = await browser.newContext();
    const inviteePage = await context.newPage();
    await inviteePage.goto(
      await magicLinkPath(invitee.email, new URL(link).pathname),
    );
    await expect(
      inviteePage.getByRole("heading", { name: "Join Invite Flow" }),
    ).toBeVisible();
    await inviteePage.getByRole("button", { name: "Join Invite Flow" }).click();
    await expect(inviteePage).toHaveURL(`/w/${slug}`);

    // Both see each other in the members list.
    await inviteePage.goto(membersPath);
    await expect(
      inviteePage.getByRole("link", { name: owner.displayName }),
    ).toBeVisible();
    // Members cannot manage anyone.
    await expect(inviteePage.getByLabel("Email")).toHaveCount(0);
    await context.close();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "2 members" }),
    ).toBeVisible();
    await expect(page.getByText("No pending invites.")).toBeVisible();

    // Change the invitee's role.
    await page.getByLabel(`Role of ${invitee.displayName}`).click();
    await page.getByRole("option", { name: "Viewer" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("workspace_members")
          .select("role")
          .eq("user_id", invitee.id)
          .maybeSingle();
        return data?.role;
      })
      .toBe("viewer");

    // Remove them.
    await page
      .getByRole("button", { name: `Remove ${invitee.displayName}` })
      .click();
    await page.getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByRole("heading", { name: "1 member" })).toBeVisible();

    // The only owner cannot leave.
    await expect(
      page.getByRole("button", { name: "Leave workspace" }),
    ).toBeDisabled();
  });

  test("an owner revokes a pending invite", async ({
    page,
    admin,
    user: owner,
    magicLinkPath,
  }) => {
    const slug = await createWorkspace(admin, owner, "Revoke Co");
    const email = `e2e+revoke-${uniqueId()}@tessera.test`;
    await page.goto(
      await magicLinkPath(owner.email, `/w/${slug}/settings/members`),
    );

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();

    await page
      .getByRole("button", { name: `Revoke invite for ${email}` })
      .click();
    await page.getByRole("button", { name: "Revoke invite" }).click();
    await expect(page.getByText("No pending invites.")).toBeVisible();
  });

  test("create, switch and return to the last used workspace", async ({
    page,
    admin,
    user,
    magicLinkPath,
  }) => {
    const first = await createWorkspace(admin, user, "Alpha Team");
    const second = `beta-${uniqueId()}`;

    await page.goto(await magicLinkPath(user.email, "/w"));
    await expect(page.getByRole("link", { name: /Alpha Team/ })).toBeVisible();

    await page.getByRole("link", { name: "Create workspace" }).click();
    await expect(page).toHaveURL("/w/new");
    await page.getByLabel("Workspace name").fill("Beta Team");
    await page.getByLabel("URL").fill(second);
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(`/w/${second}`);
    await expect(
      page.getByRole("heading", { name: "Beta Team", level: 1 }),
    ).toBeVisible();

    // Switch through the header menu.
    await page
      .getByRole("button", { name: "Workspace: Beta Team. Switch workspace" })
      .click();
    await page.getByRole("menuitem", { name: /Alpha Team/ }).click();
    await expect(page).toHaveURL(`/w/${first}`);
    await expect(
      page.getByRole("heading", { name: "Alpha Team", level: 1 }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find(
            (c) => c.name === "tessera-last-workspace",
          )?.value,
      )
      .toBe(first);

    // `/w` returns to the last used workspace; `?all` lists them.
    await page.goto("/w");
    await expect(page).toHaveURL(`/w/${first}`);
    await page.goto("/w?all=1");
    await expect(page.getByRole("link", { name: /Beta Team/ })).toBeVisible();
  });

  test("a workspace the user is not in is a 404", async ({
    page,
    admin,
    user,
    createUser,
    magicLinkPath,
  }) => {
    const stranger = await createUser({ onboarded: true });
    const slug = await createWorkspace(admin, stranger, "Private Co");

    await page.goto(await magicLinkPath(user.email, `/w/${slug}`));
    await expect(
      page.getByRole("heading", { name: "Workspace not found" }),
    ).toBeVisible();
    await page.goto(`/w/${slug}/settings/members`);
    await expect(
      page.getByRole("heading", { name: "Workspace not found" }),
    ).toBeVisible();
  });
});
