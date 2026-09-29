"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assetPath } from "@/lib/asset/paths";
import {
  assetSchema,
  columnsPayload,
  propertiesFor,
  type AssetInput,
} from "@/lib/asset/schema";
import { removeStoredFiles } from "@/lib/dataset-file/server";
import { fieldErrors, type FormState } from "@/lib/forms";
import { SLUG_PATTERN } from "@/lib/profile/schema";
import { requireUser, UNIQUE_VIOLATION } from "@/lib/profile/server";
import { workspacePath } from "@/lib/workspace/paths";

export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong. Try again.";
const NOT_ALLOWED = "You do not have permission to do that.";
const INSUFFICIENT_PRIVILEGE = "42501";
const FOREIGN_KEY_VIOLATION = "23503";
/** `on conflict do update` hit the same row twice: duplicate column names. */
const CARDINALITY_VIOLATION = "21000";

const workspaceRef = z.object({
  workspaceId: z.uuid(),
  workspaceSlug: z.string().regex(SLUG_PATTERN),
});

/** Catalog, asset and project pages all list assets or their links. */
function refreshCatalog() {
  revalidatePath("/w/[workspace]/catalog", "layout");
  revalidatePath("/w/[workspace]/projects", "layout");
  revalidatePath("/u/[handle]", "page");
}

function parseColumns(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readAsset(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const kind = text("kind");
  const common = {
    kind,
    name: text("name"),
    qualifiedName: text("qualifiedName"),
    description: text("description"),
    ownerId: text("ownerId"),
    tags: formData.getAll("tags").filter((t) => typeof t === "string"),
  };
  switch (kind) {
    case "dataset":
      return assetSchema.safeParse({
        ...common,
        columns: parseColumns(formData.get("columns")),
      });
    case "dashboard":
      return assetSchema.safeParse({
        ...common,
        properties: { url: text("url"), tool: text("tool") },
      });
    case "source_system":
      return assetSchema.safeParse({
        ...common,
        properties: { system: text("system"), url: text("url") },
      });
    default:
      return assetSchema.safeParse({
        ...common,
        properties: { framework: text("framework"), url: text("url") },
      });
  }
}

/** Maps a failed write to what the form shows, or `null` when it succeeded. */
function writeError(
  error: { code?: string; message: string } | null,
  input: AssetInput,
): FormState | null {
  if (!error) return null;
  if (error.code === UNIQUE_VIOLATION) {
    if (error.message.includes("assets_workspace_qualified_name_key")) {
      return {
        status: "error",
        fieldErrors: {
          qualifiedName: `An asset named ${input.qualifiedName} already exists in this workspace. Use another qualified name.`,
        },
      };
    }
    return {
      status: "error",
      fieldErrors: { columns: "Column names must be unique." },
    };
  }
  if (error.code === CARDINALITY_VIOLATION) {
    return {
      status: "error",
      fieldErrors: { columns: "Column names must be unique." },
    };
  }
  if (error.code === FOREIGN_KEY_VIOLATION) {
    return {
      status: "error",
      fieldErrors: { ownerId: "Choose a member of this workspace." },
    };
  }
  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return { status: "error", message: NOT_ALLOWED };
  }
  return { status: "error", message: GENERIC_ERROR };
}

/** `created`: a dataset whose file the browser uploads next (no redirect yet). */
export type CreateAssetState =
  FormState | { status: "created"; assetId: string; href: string };

/**
 * Registers an asset and opens its page. A dataset started from a file
 * (`withFile=1`) is created without columns and returns `created`: the
 * browser uploads the file next, and its columns become the v1 schema.
 */
export async function createAsset(
  _previous: CreateAssetState,
  formData: FormData,
): Promise<CreateAssetState> {
  const ref = workspaceRef.safeParse({
    workspaceId: formData.get("workspaceId"),
    workspaceSlug: formData.get("workspaceSlug"),
  });
  const input = readAsset(formData);
  if (!ref.success) return { status: "error", message: GENERIC_ERROR };
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }
  const withFile =
    formData.get("withFile") === "1" && input.data.kind === "dataset";

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_asset", {
    workspace: ref.data.workspaceId,
    kind: input.data.kind,
    name: input.data.name,
    qualified_name: input.data.qualifiedName,
    description: input.data.description,
    owner: input.data.ownerId,
    tags: input.data.tags,
    properties: propertiesFor(input.data),
    columns:
      input.data.kind === "dataset" && !withFile
        ? columnsPayload(input.data.columns)
        : undefined,
  });
  const failed = writeError(error, input.data);
  if (failed) return failed;
  if (!data) return { status: "error", message: GENERIC_ERROR };

  refreshCatalog();
  const href = assetPath(ref.data.workspaceSlug, data.qualified_name);
  if (withFile) return { status: "created", assetId: data.id, href };
  redirect(href);
}

/** Saves an asset (and a dataset's columns) and returns to its page. */
export async function updateAsset(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const ref = workspaceRef.extend({ assetId: z.uuid() }).safeParse({
    workspaceId: formData.get("workspaceId"),
    workspaceSlug: formData.get("workspaceSlug"),
    assetId: formData.get("assetId"),
  });
  const input = readAsset(formData);
  if (!ref.success) return { status: "error", message: GENERIC_ERROR };
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("update_asset", {
    asset: ref.data.assetId,
    name: input.data.name,
    qualified_name: input.data.qualifiedName,
    description: input.data.description,
    owner: input.data.ownerId,
    tags: input.data.tags,
    properties: propertiesFor(input.data),
    columns:
      input.data.kind === "dataset"
        ? columnsPayload(input.data.columns)
        : undefined,
  });
  const failed = writeError(error, input.data);
  if (failed) return failed;
  if (!data) return { status: "error", message: GENERIC_ERROR };

  refreshCatalog();
  redirect(assetPath(ref.data.workspaceSlug, data.qualified_name));
}

const assetRefSchema = z.object({
  assetId: z.uuid(),
  workspaceSlug: z.string().regex(SLUG_PATTERN),
});

/**
 * Deletes an asset (its entity; columns and links cascade) and returns to
 * the catalog.
 */
export async function deleteAsset(
  raw: z.input<typeof assetRefSchema>,
): Promise<ActionResult> {
  const input = assetRefSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  // Read the stored files first: their rows cascade with the asset.
  const files = await supabase
    .from("dataset_files")
    .select("workspace_id, storage_path")
    .eq("asset_id", input.data.assetId)
    .is("purged_at", null);
  const { data, error } = await supabase
    .from("entities")
    .delete()
    .eq("id", input.data.assetId)
    .eq("type", "asset")
    .select("id");
  if (error || data.length === 0) {
    return {
      ok: false,
      message: "Only the asset's owner or a workspace admin can delete it.",
    };
  }
  const stored = files.data ?? [];
  if (stored.length) {
    await removeStoredFiles(
      stored[0]!.workspace_id,
      stored.map((f) => f.storage_path),
    );
  }

  refreshCatalog();
  redirect(workspacePath(input.data.workspaceSlug, "catalog"));
}

const linkSchema = z.object({
  workspaceId: z.uuid(),
  assetId: z.uuid(),
  projectId: z.uuid({ error: "Choose a project." }),
});

/** Links an asset to a project (project editors only). */
export async function linkAssetToProject(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = linkSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    assetId: formData.get("assetId"),
    projectId: formData.get("projectId"),
  });
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_assets").insert({
    workspace_id: input.data.workspaceId,
    asset_id: input.data.assetId,
    project_id: input.data.projectId,
  });
  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: "error",
      message: "It is already linked to that project.",
    };
  }
  if (error) {
    return {
      status: "error",
      message:
        "Only the project's leads and contributors can link assets to it.",
    };
  }

  refreshCatalog();
  return { status: "saved" };
}

const unlinkSchema = z.object({ assetId: z.uuid(), projectId: z.uuid() });

export async function unlinkAssetFromProject(
  raw: z.input<typeof unlinkSchema>,
): Promise<ActionResult> {
  const input = unlinkSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("project_assets")
    .delete()
    .eq("project_id", input.data.projectId)
    .eq("asset_id", input.data.assetId)
    .select("asset_id");
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshCatalog();
  return { ok: true };
}
