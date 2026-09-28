"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fieldErrors, type FormState } from "@/lib/forms";
import { SLUG_PATTERN } from "@/lib/profile/schema";
import { requireUser, UNIQUE_VIOLATION } from "@/lib/profile/server";
import { projectPath } from "@/lib/project/paths";
import {
  addProjectMemberSchema,
  archiveProjectSchema,
  changeProjectRoleSchema,
  projectMemberRefSchema,
  projectSchema,
} from "@/lib/project/schema";

export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong. Try again.";
const NOT_ALLOWED = "You do not have permission to do that.";
const SLUG_TAKEN = "That URL is taken in this workspace. Try another.";
const INSUFFICIENT_PRIVILEGE = "42501";
const FOREIGN_KEY_VIOLATION = "23503";

const workspaceRef = z.object({
  workspaceId: z.uuid(),
  workspaceSlug: z.string().regex(SLUG_PATTERN),
});

/** Every project page reads projects and their members. */
function refreshProjects() {
  revalidatePath("/w/[workspace]/projects", "layout");
}

function readProject(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
    status: formData.get("status"),
    visibility: formData.get("visibility"),
  });
}

/** Creates a project (the caller becomes its lead) and opens it. */
export async function createProject(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const ref = workspaceRef.safeParse({
    workspaceId: formData.get("workspaceId"),
    workspaceSlug: formData.get("workspaceSlug"),
  });
  const input = readProject(formData);
  if (!ref.success) return { status: "error", message: GENERIC_ERROR };
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_project", {
    workspace: ref.data.workspaceId,
    name: input.data.name,
    slug: input.data.slug,
    description: input.data.description,
    status: input.data.status,
    is_private: input.data.visibility === "private",
  });
  if (error?.code === UNIQUE_VIOLATION) {
    return { status: "error", fieldErrors: { slug: SLUG_TAKEN } };
  }
  if (error?.code === INSUFFICIENT_PRIVILEGE) {
    return { status: "error", message: NOT_ALLOWED };
  }
  if (error || !data) return { status: "error", message: GENERIC_ERROR };

  refreshProjects();
  redirect(projectPath(ref.data.workspaceSlug, data.slug));
}

/** Saves a project's details and returns to its (possibly new) URL. */
export async function updateProject(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const ref = workspaceRef.extend({ projectId: z.uuid() }).safeParse({
    workspaceId: formData.get("workspaceId"),
    workspaceSlug: formData.get("workspaceSlug"),
    projectId: formData.get("projectId"),
  });
  const input = readProject(formData);
  if (!ref.success) return { status: "error", message: GENERIC_ERROR };
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("update_project", {
    project: ref.data.projectId,
    name: input.data.name,
    slug: input.data.slug,
    description: input.data.description,
    status: input.data.status,
    is_private: input.data.visibility === "private",
  });
  if (error?.code === UNIQUE_VIOLATION) {
    return { status: "error", fieldErrors: { slug: SLUG_TAKEN } };
  }
  if (error?.code === INSUFFICIENT_PRIVILEGE) {
    return { status: "error", message: NOT_ALLOWED };
  }
  if (error || !data) return { status: "error", message: GENERIC_ERROR };

  refreshProjects();
  redirect(projectPath(ref.data.workspaceSlug, data.slug));
}

export async function setProjectArchived(
  raw: z.input<typeof archiveProjectSchema>,
): Promise<ActionResult> {
  const input = archiveProjectSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("projects")
    .update({
      archived_at: input.data.archived ? new Date().toISOString() : null,
    })
    .eq("id", input.data.projectId)
    .select("id");
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshProjects();
  return { ok: true };
}

export async function addProjectMember(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = addProjectMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    workspaceId: formData.get("workspaceId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_members").insert({
    project_id: input.data.projectId,
    workspace_id: input.data.workspaceId,
    user_id: input.data.userId,
    role: input.data.role,
  });
  if (error?.code === UNIQUE_VIOLATION) {
    return { status: "error", message: "They are already in this project." };
  }
  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return {
      status: "error",
      message: "Only members of this workspace can join its projects.",
    };
  }
  if (error) return { status: "error", message: NOT_ALLOWED };

  refreshProjects();
  return { status: "saved" };
}

export async function changeProjectMemberRole(
  raw: z.input<typeof changeProjectRoleSchema>,
): Promise<ActionResult> {
  const input = changeProjectRoleSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("project_members")
    .update({ role: input.data.role })
    .eq("project_id", input.data.projectId)
    .eq("user_id", input.data.userId)
    .select("role");
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshProjects();
  return { ok: true };
}

/** Removes a member, or the signed-in user themselves (leave). */
export async function removeProjectMember(
  raw: z.input<typeof projectMemberRefSchema>,
): Promise<ActionResult> {
  const input = projectMemberRefSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", input.data.projectId)
    .eq("user_id", input.data.userId)
    .select("user_id");
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshProjects();
  return { ok: true };
}
