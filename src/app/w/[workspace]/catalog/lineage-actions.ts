"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AssetKind } from "@/lib/asset/kinds";
import { fieldErrors, type FormState } from "@/lib/forms";
import {
  addEdgeSchema,
  assetSearchSchema,
  edgeEndpoints,
  likePattern,
} from "@/lib/lineage/lineage";
import { requireUser, UNIQUE_VIOLATION } from "@/lib/profile/server";

import type { ActionResult } from "./actions";

const CHECK_VIOLATION = "23514";

function refreshAssets() {
  revalidatePath("/w/[workspace]/catalog/[asset]", "page");
}

/** Adds an edge between the page's asset and another one, as the user. */
export async function addAssetEdge(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = addEdgeSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    assetId: formData.get("assetId"),
    otherAssetId: formData.get("otherAssetId") ?? "",
    direction: formData.get("direction"),
    relation: formData.get("relation") ?? "",
  });
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { from, to } = edgeEndpoints(input.data);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("asset_edges").insert({
    workspace_id: input.data.workspaceId,
    from_asset: from,
    to_asset: to,
    relation: input.data.relation,
  });
  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: "error",
      message: "Those assets are already linked with that relation.",
    };
  }
  if (error?.code === CHECK_VIOLATION) {
    return { status: "error", message: "An asset cannot feed itself." };
  }
  if (error) {
    return {
      status: "error",
      message: "Only workspace members who can edit both assets can link them.",
    };
  }

  refreshAssets();
  return { status: "saved" };
}

const removeSchema = z.object({ edgeId: z.uuid() });

/** Removes a lineage edge the user can edit. */
export async function removeAssetEdge(
  raw: z.input<typeof removeSchema>,
): Promise<ActionResult> {
  const input = removeSchema.safeParse(raw);
  if (!input.success) {
    return { ok: false, message: "Something went wrong. Try again." };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("asset_edges")
    .delete()
    .eq("id", input.data.edgeId)
    .select("id");
  if (error || data.length === 0) {
    return { ok: false, message: "You do not have permission to do that." };
  }

  refreshAssets();
  return { ok: true };
}

export type AssetOption = {
  id: string;
  kind: AssetKind;
  name: string;
  qualifiedName: string;
};

/**
 * Up to 20 of the workspace's assets whose name or qualified name contains
 * `query` (all of them, by name, for an empty query), without `excludeId`.
 */
export async function searchAssets(
  raw: z.input<typeof assetSearchSchema>,
): Promise<AssetOption[]> {
  const input = assetSearchSchema.safeParse(raw);
  if (!input.success) return [];

  const { supabase } = await requireUser();
  let query = supabase
    .from("catalog_assets")
    .select("id, kind, name, qualified_name")
    .eq("workspace_id", input.data.workspaceId)
    .neq("id", input.data.excludeId)
    .order("name")
    .limit(20);
  if (input.data.query) {
    const pattern = likePattern(input.data.query);
    // Quoted so PostgREST reads commas and parentheses as part of the value.
    const value = `"${pattern.replace(/(["\\])/g, "\\$1")}"`;
    query = query.or(`name.ilike.${value},qualified_name.ilike.${value}`);
  }
  const { data, error } = await query;
  if (error) throw new Error("Could not search the catalog.");
  return data.flatMap((a) =>
    a.id && a.kind && a.name && a.qualified_name
      ? [
          {
            id: a.id,
            kind: a.kind,
            name: a.name,
            qualifiedName: a.qualified_name,
          },
        ]
      : [],
  );
}
