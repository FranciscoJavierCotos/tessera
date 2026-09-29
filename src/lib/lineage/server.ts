import "server-only";

import { requireUser } from "@/lib/profile/server";

import { lineageSchema, type Lineage } from "./lineage";

/** Upstream and downstream of `assetId`, up to `depth` hops each way. */
export async function getLineage(
  assetId: string,
  depth: number,
): Promise<Lineage> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("asset_lineage", {
    root: assetId,
    direction: "both",
    max_depth: depth,
  });
  if (error) throw new Error("Could not load the lineage.");
  return lineageSchema.parse(data);
}
