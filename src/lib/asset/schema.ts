import { z } from "zod";

import {
  ASSET_KINDS,
  DASHBOARD_TOOLS,
  type AssetKind,
  type DashboardTool,
} from "./kinds";

// Mirrors the DB checks on `assets`, `dataset_columns` and `entities` (the
// DB is the gate).
export const MAX_ASSET_NAME = 200;
export const MAX_QUALIFIED_NAME = 255;
export const MAX_ASSET_DESCRIPTION = 20000;
export const MAX_TAGS = 20;
export const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const MAX_COLUMNS = 500;
export const MAX_COLUMN_NAME = 255;
export const MAX_COLUMN_TYPE = 100;
export const MAX_COLUMN_DESCRIPTION = 5000;
export const MAX_PROPERTY_TEXT = 100;
/** Characters a qualified name cannot hold (it is part of the asset's URL). */
const QUALIFIED_NAME_FORBIDDEN = /[\s/?#%\\]/;
/** `db.schema.table` or `schema.table`: 2–3 non-empty dot-separated parts. */
const DATASET_QUALIFIED_NAME = /^[^.]+(\.[^.]+){1,2}$/;
const RESERVED_QUALIFIED_NAMES: readonly string[] = ["new"];

const qualifiedNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter a qualified name." })
  .max(MAX_QUALIFIED_NAME, {
    error: `Use at most ${MAX_QUALIFIED_NAME} characters.`,
  })
  .refine((value) => !QUALIFIED_NAME_FORBIDDEN.test(value), {
    error: "Spaces and / ? # % \\ are not allowed.",
  })
  .refine((value) => !RESERVED_QUALIFIED_NAMES.includes(value.toLowerCase()), {
    error: "That name is reserved. Try another.",
  });

/** Lowercases and dedupes tags, keeping their order. */
export function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ];
}

export const tagsSchema = z
  .array(z.string())
  .transform(normalizeTags)
  .pipe(
    z
      .array(
        z.string().regex(TAG_PATTERN, {
          error:
            "Tags use up to 32 lowercase letters, numbers, dashes and underscores.",
        }),
      )
      .max(MAX_TAGS, { error: `Add at most ${MAX_TAGS} tags.` }),
  );

const optionalUrl = z
  .string()
  .trim()
  .max(500, { error: "Use at most 500 characters." })
  .pipe(
    z.union([
      z.literal(""),
      z.url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: "Enter a full http(s) URL.",
      }),
    ]),
  );

const optionalText = z
  .string()
  .trim()
  .max(MAX_PROPERTY_TEXT, {
    error: `Use at most ${MAX_PROPERTY_TEXT} characters.`,
  });

export const columnSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Name the column." })
    .max(MAX_COLUMN_NAME, {
      error: `Use at most ${MAX_COLUMN_NAME} characters.`,
    }),
  dataType: z
    .string()
    .trim()
    .max(MAX_COLUMN_TYPE, {
      error: `Use at most ${MAX_COLUMN_TYPE} characters.`,
    }),
  description: z
    .string()
    .trim()
    .max(MAX_COLUMN_DESCRIPTION, {
      error: `Use at most ${MAX_COLUMN_DESCRIPTION} characters.`,
    }),
  isPii: z.boolean(),
});

export type ColumnInput = z.infer<typeof columnSchema>;

export const columnsSchema = z
  .array(columnSchema)
  .max(MAX_COLUMNS, { error: `Add at most ${MAX_COLUMNS} columns.` })
  .superRefine((columns, ctx) => {
    const seen = new Set<string>();
    columns.forEach((column, index) => {
      const key = column.name.toLowerCase();
      if (key && seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Column names must be unique.",
        });
      }
      seen.add(key);
    });
  });

const base = {
  name: z
    .string()
    .trim()
    .min(1, { error: "Name the asset." })
    .max(MAX_ASSET_NAME, {
      error: `Use at most ${MAX_ASSET_NAME} characters.`,
    }),
  qualifiedName: qualifiedNameSchema,
  description: z
    .string()
    .trim()
    .max(MAX_ASSET_DESCRIPTION, {
      error: `Use at most ${MAX_ASSET_DESCRIPTION} characters.`,
    }),
  ownerId: z.uuid({ error: "Choose an owner." }),
  tags: tagsSchema,
};

export const assetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dataset"),
    ...base,
    qualifiedName: qualifiedNameSchema.regex(DATASET_QUALIFIED_NAME, {
      error: "Use db.schema.table (or schema.table).",
    }),
    columns: columnsSchema,
  }),
  z.object({
    kind: z.literal("dashboard"),
    ...base,
    properties: z.object({
      url: optionalUrl.refine(Boolean, { error: "Enter the dashboard URL." }),
      tool: z.enum(DASHBOARD_TOOLS, { error: "Choose a tool." }),
    }),
  }),
  z.object({
    kind: z.literal("source_system"),
    ...base,
    properties: z.object({ system: optionalText, url: optionalUrl }),
  }),
  z.object({
    kind: z.literal("ml_model"),
    ...base,
    properties: z.object({ framework: optionalText, url: optionalUrl }),
  }),
]);

export type AssetInput = z.infer<typeof assetSchema>;

/** Kind-specific fields, as stored in `assets.properties`. */
export type AssetProperties = {
  url?: string;
  tool?: DashboardTool;
  system?: string;
  framework?: string;
};

/** Reads `assets.properties` (jsonb) leniently: unknown fields are dropped. */
export function parseProperties(value: unknown): AssetProperties {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof record[key] === "string" && record[key]
      ? (record[key] as string)
      : undefined;
  const tool = DASHBOARD_TOOLS.find((t) => t === record.tool);
  return {
    url: text("url"),
    tool,
    system: text("system"),
    framework: text("framework"),
  };
}

/** The properties to store: empty optional fields are left out. */
export function propertiesFor(input: AssetInput): AssetProperties {
  if (input.kind === "dataset") return {};
  return Object.fromEntries(
    Object.entries(input.properties).filter(([, value]) => value !== ""),
  );
}

/** Columns as `set_dataset_columns` expects them (snake_case, in order). */
export function columnsPayload(columns: ColumnInput[]) {
  return columns.map((column) => ({
    name: column.name,
    data_type: column.dataType,
    description: column.description,
    is_pii: column.isPii,
  }));
}

/** A qualified name suggestion from a name: `Revenue Overview` → `revenue_overview`. */
export function suggestQualifiedName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Catalog list query (`?kind=&owner=&tag=&project=&sort=&page=`)
// ---------------------------------------------------------------------------

export const CATALOG_PAGE_SIZE = 25;
export const CATALOG_SORTS = ["updated", "name", "kind"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  updated: "Recently updated",
  name: "Name (A–Z)",
  kind: "Kind",
};

export type CatalogQuery = {
  kind: AssetKind | null;
  /** A user id. */
  owner: string | null;
  tag: string | null;
  /** A project slug. */
  project: string | null;
  sort: CatalogSort;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parses the catalog's search params; anything invalid falls back. */
export function parseCatalogQuery(params: SearchParams): CatalogQuery {
  const kind = ASSET_KINDS.find((k) => k === first(params.kind)) ?? null;
  const owner = z.uuid().safeParse(first(params.owner));
  const tag = first(params.tag)?.trim().toLowerCase();
  const project = first(params.project)?.trim().toLowerCase();
  const sort = CATALOG_SORTS.find((s) => s === first(params.sort)) ?? "updated";
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    kind,
    owner: owner.success ? owner.data : null,
    tag: tag && TAG_PATTERN.test(tag) ? tag : null,
    project: project && /^[a-z0-9-]{3,40}$/.test(project) ? project : null,
    sort,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10000) : 1,
  };
}

/** The search string for `query` (defaults left out), with `?` when non-empty. */
export function catalogSearch(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.kind) params.set("kind", query.kind);
  if (query.owner) params.set("owner", query.owner);
  if (query.tag) params.set("tag", query.tag);
  if (query.project) params.set("project", query.project);
  if (query.sort !== "updated") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Whether any filter (not sort or page) is set. */
export function hasCatalogFilters(query: CatalogQuery): boolean {
  return Boolean(query.kind || query.owner || query.tag || query.project);
}
