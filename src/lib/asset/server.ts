import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/profile/server";

import type { AssetKind } from "./kinds";
import { parseProperties, type AssetProperties } from "./schema";

export type Asset = {
  id: string;
  workspaceId: string;
  kind: AssetKind;
  name: string;
  qualifiedName: string;
  description: string;
  tags: string[];
  properties: AssetProperties;
  ownerId: string;
  owner: { name: string | null; handle: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type DatasetColumn = {
  id: string;
  name: string;
  dataType: string;
  description: string;
  isPii: boolean;
};

/**
 * The asset at `/w/<workspace>/catalog/<qualified name>` if the user can see
 * it, else `null`. Qualified names match case-insensitively (citext).
 * Per request.
 */
export const getAsset = cache(
  async (workspaceId: string, qualifiedName: string): Promise<Asset | null> => {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, workspace_id, kind, qualified_name, description, tags, properties, created_at, updated_at, entities(title, owner_id, updated_at, profiles(display_name, handle))",
      )
      .eq("workspace_id", workspaceId)
      .eq("qualified_name", decodeURIComponent(qualifiedName))
      .maybeSingle();
    if (error) throw new Error("Could not load the asset.");
    if (!data?.entities) return null;

    const entity = data.entities;
    return {
      id: data.id,
      workspaceId: data.workspace_id,
      kind: data.kind,
      name: entity.title,
      qualifiedName: data.qualified_name,
      description: data.description,
      tags: data.tags,
      properties: parseProperties(data.properties),
      ownerId: entity.owner_id,
      owner: entity.profiles
        ? { name: entity.profiles.display_name, handle: entity.profiles.handle }
        : null,
      createdAt: data.created_at,
      updatedAt:
        entity.updated_at > data.updated_at
          ? entity.updated_at
          : data.updated_at,
    };
  },
);

/** A dataset's columns in display order. */
export async function getDatasetColumns(
  assetId: string,
): Promise<DatasetColumn[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("dataset_columns")
    .select("id, name, data_type, description, is_pii")
    .eq("asset_id", assetId)
    .order("ordinal");
  if (error) throw new Error("Could not load the columns.");
  return data.map((column) => ({
    id: column.id,
    name: column.name,
    dataType: column.data_type,
    description: column.description,
    isPii: column.is_pii,
  }));
}

export type MemberOption = { userId: string; label: string };

/** The workspace's members as owner choices, by name. Per request. */
export const listMemberOptions = cache(
  async (workspaceId: string): Promise<MemberOption[]> => {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("workspace_members")
      .select("user_id, profiles(display_name, handle)")
      .eq("workspace_id", workspaceId);
    if (error) throw new Error("Could not load the workspace members.");
    return data
      .map((m) => ({
        userId: m.user_id,
        label:
          m.profiles?.display_name ??
          (m.profiles?.handle ? `@${m.profiles.handle}` : "Unnamed member"),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
);
