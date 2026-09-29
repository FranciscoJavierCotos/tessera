import { Constants, type Database } from "@/lib/db/types";
import { hasRole, type WorkspaceRole } from "@/lib/workspace/roles";

export type AssetKind = Database["public"]["Enums"]["asset_kind"];

export const ASSET_KINDS = Constants.public.Enums.asset_kind;

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  dataset: "Dataset",
  dashboard: "Dashboard",
  source_system: "Source system",
  ml_model: "ML model",
};

export const ASSET_KIND_PLURALS: Record<AssetKind, string> = {
  dataset: "Datasets",
  dashboard: "Dashboards",
  source_system: "Source systems",
  ml_model: "ML models",
};

export const ASSET_KIND_DESCRIPTIONS: Record<AssetKind, string> = {
  dataset: "A table or view in the warehouse, with its columns.",
  dashboard: "A report in a BI tool.",
  source_system: "An application or database the data comes from.",
  ml_model: "A trained model and where it is registered.",
};

/** Examples for the qualified name field, per kind. */
export const QUALIFIED_NAME_EXAMPLES: Record<AssetKind, string> = {
  dataset: "analytics.marts.fct_orders",
  dashboard: "looker.revenue_overview",
  source_system: "postgres.shop_app",
  ml_model: "mlflow.churn_classifier",
};

export const DASHBOARD_TOOLS = [
  "looker",
  "tableau",
  "power_bi",
  "metabase",
  "superset",
  "mode",
  "hex",
  "streamlit",
  "other",
] as const;

export type DashboardTool = (typeof DASHBOARD_TOOLS)[number];

export const DASHBOARD_TOOL_LABELS: Record<DashboardTool, string> = {
  looker: "Looker",
  tableau: "Tableau",
  power_bi: "Power BI",
  metabase: "Metabase",
  superset: "Superset",
  mode: "Mode",
  hex: "Hex",
  streamlit: "Streamlit",
  other: "Other",
};

// These mirror the RLS policies on `entities` and `assets` so the UI only
// offers what the database will accept. The database is the gate.

/** Workspace members (not viewers) create and edit assets. */
export function canEditAssets(role: WorkspaceRole | null): boolean {
  return hasRole(role, "member");
}

/** The owner (while still a member) or a workspace owner/admin deletes. */
export function canDeleteAsset(
  role: WorkspaceRole | null,
  ownerId: string,
  userId: string,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return role === "member" && ownerId === userId;
}
