import { expect, test } from "./support/auth";
import { addWorkspaceMember, createProject } from "./support/project";
import { createWorkspace } from "./support/workspace";

test.describe("projects", () => {
  test("create a project, filter the list, edit and archive it", async ({
    page,
    admin,
    user,
    signIn,
  }) => {
    const slug = await createWorkspace(admin, user, "Projects Co");
    await signIn(user, `/w/${slug}/projects`);
    await expect(
      page.getByRole("heading", { name: "No projects yet" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "New project" }).click();
    await expect(page).toHaveURL(`/w/${slug}/projects/new`);
    await page.getByLabel("Project name").fill("Revenue Revamp");
    await expect(page.getByLabel("URL")).toHaveValue("revenue-revamp");
    await page.getByLabel("Description").fill("Rebuild the revenue dashboard.");
    await page.getByLabel("Private").check();
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page).toHaveURL(`/w/${slug}/projects/revenue-revamp`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Revenue Revamp" }),
    ).toBeVisible();
    await expect(
      page.getByText("Rebuild the revenue dashboard."),
    ).toBeVisible();
    await expect(page.getByText("Private", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1 member" })).toBeVisible();
    for (const slot of [
      "No linked assets",
      "No pages yet",
      "No activity yet",
    ]) {
      await expect(page.getByRole("heading", { name: slot })).toBeVisible();
    }

    // The list filters by status.
    await page.goto(`/w/${slug}/projects`);
    const table = page.getByRole("table", { name: "Projects" });
    const row = table.getByRole("link", { name: "Revenue Revamp" });
    await expect(row).toBeVisible();
    const filters = page.getByRole("navigation", {
      name: "Filter projects by status",
    });
    await filters.getByRole("link", { name: "Active" }).click();
    await expect(page).toHaveURL(`/w/${slug}/projects?status=active`);
    await expect(
      page.getByRole("heading", { name: "No active projects" }),
    ).toBeVisible();
    await filters.getByRole("link", { name: "Planning" }).click();
    await expect(row).toBeVisible();

    // Edit the status and the URL.
    await row.click();
    await page.getByRole("link", { name: "Project settings" }).click();
    await page.getByLabel("URL").fill("revenue-v2");
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "Active" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(`/w/${slug}/projects/revenue-v2`);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    // Archive: it leaves the list and shows under Archived.
    await page.getByRole("link", { name: "Project settings" }).click();
    await page.getByRole("button", { name: "Archive project" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(
      page.getByRole("button", { name: "Restore project" }),
    ).toBeVisible();
    await page.goto(`/w/${slug}/projects`);
    await expect(
      page.getByRole("heading", { name: "No open projects" }),
    ).toBeVisible();
    await filters.getByRole("link", { name: "Archived" }).click();
    await expect(row).toBeVisible();
  });

  test("a contributor can edit, a project viewer cannot, an outsider gets a 404", async ({
    page,
    browser,
    admin,
    user: lead,
    createUser,
    signIn,
  }) => {
    const [contributor, viewer, outsider] = await Promise.all([
      createUser({ onboarded: true }),
      createUser({ onboarded: true }),
      createUser({ onboarded: true }),
    ]);
    const slug = await createWorkspace(admin, lead, "Roles Co");
    const workspaceId = await addWorkspaceMember(admin, slug, contributor);
    await addWorkspaceMember(admin, slug, viewer);
    await addWorkspaceMember(admin, slug, outsider);
    const project = await createProject(admin, {
      workspaceId,
      lead,
      name: "Secret Pipeline",
      isPrivate: true,
      members: [
        { user: contributor, role: "contributor" },
        { user: viewer, role: "viewer" },
      ],
    });
    const home = `/w/${slug}/projects/${project}`;

    // The contributor edits the name; visibility is lead-only.
    await signIn(contributor, `${home}/settings`);
    await expect(
      page.getByRole("heading", { name: "Project settings" }),
    ).toBeVisible();
    await expect(page.getByLabel("Private")).toBeDisabled();
    await page.getByLabel("Project name").fill("Secret Pipeline v2");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(home);
    await expect(
      page.getByRole("heading", { level: 1, name: "Secret Pipeline v2" }),
    ).toBeVisible();
    // Contributors do not manage members.
    await expect(page.getByLabel("Teammate")).toHaveCount(0);

    // The project viewer has no settings link; the page is read-only.
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await signIn(viewer, home, viewerPage);
    await expect(
      viewerPage.getByRole("heading", { level: 1, name: "Secret Pipeline v2" }),
    ).toBeVisible();
    await expect(
      viewerPage.getByRole("link", { name: "Project settings" }),
    ).toHaveCount(0);
    await viewerPage.goto(`${home}/settings`);
    await expect(
      viewerPage.getByRole("heading", {
        name: "You can view this project but not edit it",
      }),
    ).toBeVisible();
    await viewerContext.close();

    // A workspace member outside the private project gets a 404 and does
    // not see it in the list.
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    await signIn(outsider, home, outsiderPage);
    await expect(
      outsiderPage.getByRole("heading", { name: "Project not found" }),
    ).toBeVisible();
    await outsiderPage.goto(`/w/${slug}/projects`);
    await expect(
      outsiderPage.getByRole("heading", { name: "No projects yet" }),
    ).toBeVisible();
    await outsiderContext.close();
  });

  test("a lead adds a member, changes their role and removes them", async ({
    page,
    admin,
    user: lead,
    createUser,
    signIn,
  }) => {
    const teammate = await createUser({ onboarded: true });
    const slug = await createWorkspace(admin, lead, "Team Co");
    const workspaceId = await addWorkspaceMember(admin, slug, teammate);
    const project = await createProject(admin, {
      workspaceId,
      lead,
      name: "Churn Model",
    });

    await signIn(lead, `/w/${slug}/projects/${project}`);
    await expect(page.getByRole("heading", { name: "1 member" })).toBeVisible();
    await page.getByLabel("Teammate").click();
    await page.getByRole("option", { name: teammate.displayName }).click();
    await page.getByRole("button", { name: "Add to project" }).click();
    await expect(
      page.getByRole("heading", { name: "2 members" }),
    ).toBeVisible();

    await page.getByLabel(`Project role of ${teammate.displayName}`).click();
    await page.getByRole("option", { name: "Viewer" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("project_members")
          .select("role")
          .eq("user_id", teammate.id)
          .maybeSingle();
        return data?.role;
      })
      .toBe("viewer");

    await page
      .getByRole("button", {
        name: `Remove ${teammate.displayName} from the project`,
      })
      .click();
    await page.getByRole("button", { name: "Remove from project" }).click();
    await expect(page.getByRole("heading", { name: "1 member" })).toBeVisible();
  });
});
