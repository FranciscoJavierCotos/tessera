import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import {
  createFixtureUser,
  deleteFixtureUsers,
  type FixtureUser,
} from "./fixtures";
import {
  asUser,
  createAdminClient,
  expectDenied,
  expectRows,
  type TypedClient,
} from "./helpers";

const fx = inject("fixtures");
const { acme, globex } = fx.workspaces;
const admin = createAdminClient();

const BUCKET = "dataset-files";
const CSV = "order_id,amount\n1,9.5\n";
const INSUFFICIENT_PRIVILEGE = "42501";
const NO_DATA_FOUND = "P0002";

// M: acme member (creates the datasets). V: acme viewer. B: globex owner.
let m: FixtureUser;
let asM: TypedClient;
let v: TypedClient;
let b: TypedClient;
let datasetId: string;
const stored: string[] = [];

const qn = (name: string) => `files_${fx.runId}.${name}`;

const COLUMNS = [
  { name: "order_id", data_type: "bigint", description: "Key", is_pii: false },
  { name: "email", data_type: "text", description: "", is_pii: true },
];

function objectPath(
  assetId: string,
  fileId: string,
  name = "orders.csv",
  workspace = acme,
) {
  return `${workspace}/${assetId}/${fileId}/${name}`;
}

async function upload(client: TypedClient, path: string, body = CSV) {
  const result = await client.storage
    .from(BUCKET)
    .upload(path, new Blob([body], { type: "text/csv" }), {
      contentType: "text/csv",
    });
  if (!result.error) stored.push(path);
  return result;
}

/** Uploads a CSV as `client` and records it as the next file version. */
async function addFile(
  client: TypedClient,
  assetId: string,
  columns: typeof COLUMNS,
  filename = "orders.csv",
) {
  const fileId = randomUUID();
  const path = objectPath(assetId, fileId);
  const uploaded = await upload(client, path);
  if (uploaded.error) throw new Error(uploaded.error.message);
  return client.rpc("add_dataset_file", {
    asset: assetId,
    file_id: fileId,
    storage_path: path,
    filename,
    format: "csv",
    columns,
    row_count: 1,
  });
}

const history = (client: TypedClient, assetId: string) =>
  client
    .from("dataset_schema_versions")
    .select("version, source, file_id, columns")
    .eq("asset_id", assetId)
    .order("version");

async function newDataset(name: string, columns?: typeof COLUMNS) {
  const { data, error } = await asM.rpc("create_asset", {
    workspace: acme,
    kind: "dataset",
    name,
    qualified_name: qn(name),
    columns,
  });
  if (error) throw new Error(error.message);
  return data!.id;
}

beforeAll(async () => {
  m = await createFixtureUser(admin, "filem", fx.runId);
  const added = await admin
    .from("workspace_members")
    .insert({ workspace_id: acme, user_id: m.id, role: "member" as const });
  if (added.error) throw new Error(added.error.message);
  [asM, v, b] = await Promise.all([
    asUser(m),
    asUser(fx.users.v),
    asUser(fx.users.b),
  ]);
  datasetId = await newDataset("orders", COLUMNS);
});

afterAll(async () => {
  if (stored.length) await admin.storage.from(BUCKET).remove(stored);
  await deleteFixtureUsers(admin, [m.id]);
});

describe("schema history", () => {
  it("creating a dataset with columns records v1 as a manual change", async () => {
    const rows = await expectRows(history(asM, datasetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      source: "manual",
      file_id: null,
    });
    expect(rows[0]!.columns).toEqual(COLUMNS);
  });

  it("saving the same columns adds no version", async () => {
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: COLUMNS,
    });
    expect(error).toBeNull();
    expect(await expectRows(history(asM, datasetId))).toHaveLength(1);
  });

  it("changing a column records the next version", async () => {
    const changed = [{ ...COLUMNS[0]!, data_type: "text" }, COLUMNS[1]!];
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: changed,
    });
    expect(error).toBeNull();
    const rows = await expectRows(history(asM, datasetId));
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows[1]!.columns).toEqual(changed);
  });

  it("a dataset created without columns has no history", async () => {
    const id = await newDataset("empty");
    const { data, error } = await history(asM, id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a file change needs a file of the same dataset", async () => {
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: COLUMNS,
      source: "file",
    });
    expect(error?.code).toBe("22023");
  });
});

describe("dataset files", () => {
  it("records v1 with the size from Storage and a file snapshot", async () => {
    const id = await newDataset("from_file");
    const columns = [
      {
        name: "order_id",
        data_type: "INTEGER",
        description: "",
        is_pii: false,
      },
    ];
    const { data, error } = await addFile(
      asM,
      id,
      columns,
      "Ventas 2026 – ñ.csv",
    );
    expect(error).toBeNull();
    expect(data).toMatchObject({
      version: 1,
      size_bytes: new Blob([CSV]).size,
      filename: "Ventas 2026 – ñ.csv",
      format: "csv",
      uploaded_by: m.id,
    });
    const rows = await expectRows(history(asM, id));
    expect(rows).toEqual([
      { version: 1, source: "file", file_id: data!.id, columns },
    ]);
  });

  it("uploading again increments the file version; an identical schema adds no snapshot", async () => {
    const id = await newDataset("twice");
    const columns = [
      { name: "a", data_type: "INTEGER", description: "", is_pii: false },
    ];
    await addFile(asM, id, columns);
    const second = await addFile(asM, id, columns);
    expect(second.error).toBeNull();
    expect(second.data!.version).toBe(2);
    expect(await expectRows(history(asM, id))).toHaveLength(1);
  });

  it("fails when the object was never uploaded", async () => {
    const fileId = randomUUID();
    const { error } = await asM.rpc("add_dataset_file", {
      asset: datasetId,
      file_id: fileId,
      storage_path: objectPath(datasetId, fileId),
      filename: "orders.csv",
      format: "csv",
      columns: COLUMNS,
    });
    expect(error?.code).toBe(NO_DATA_FOUND);
  });

  it("a direct insert must also point at an uploaded object", async () => {
    const fileId = randomUUID();
    const { error } = await asM.from("dataset_files").insert({
      id: fileId,
      asset_id: datasetId,
      workspace_id: acme,
      version: 99,
      storage_path: objectPath(datasetId, fileId),
      filename: "orders.csv",
      format: "csv",
    });
    expect(error?.code).toBe(NO_DATA_FOUND);
  });
});

describe("access", () => {
  it("a viewer cannot upload or add a file", async () => {
    const fileId = randomUUID();
    const path = objectPath(datasetId, fileId);
    const uploaded = await upload(v, path);
    expect(uploaded.error).not.toBeNull();
    const { error } = await v.rpc("add_dataset_file", {
      asset: datasetId,
      file_id: fileId,
      storage_path: path,
      filename: "orders.csv",
      format: "csv",
      columns: COLUMNS,
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("a viewer reads files, history and objects", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    await expectRows(v.from("dataset_files").select("id").eq("id", data!.id));
    await expectRows(history(v, datasetId));
    const download = await v.storage.from(BUCKET).download(data!.storage_path);
    expect(download.error).toBeNull();
  });

  it("another workspace sees nothing and cannot upload", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    const files = await b
      .from("dataset_files")
      .select("id")
      .eq("asset_id", datasetId);
    expect(files.data).toEqual([]);
    const versions = await history(b, datasetId);
    expect(versions.data).toEqual([]);
    const download = await b.storage.from(BUCKET).download(data!.storage_path);
    expect(download.error).not.toBeNull();
    const uploaded = await upload(b, objectPath(datasetId, randomUUID()));
    expect(uploaded.error).not.toBeNull();
  });

  it("an object path must name the dataset's own workspace", async () => {
    const uploaded = await upload(
      asM,
      objectPath(datasetId, randomUUID(), "x.csv", globex),
    );
    expect(uploaded.error).not.toBeNull();
  });

  it("history and files are append-only for users", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    await expectDenied(
      asM
        .from("dataset_schema_versions")
        .update({ columns: [] })
        .eq("asset_id", datasetId)
        .select(),
    );
    await expectDenied(
      asM
        .from("dataset_schema_versions")
        .delete()
        .eq("asset_id", datasetId)
        .select(),
    );
    await expectDenied(
      asM
        .from("dataset_files")
        .update({ purged_at: new Date().toISOString() })
        .eq("id", data!.id)
        .select(),
    );
    await expectDenied(
      asM.from("dataset_files").delete().eq("id", data!.id).select(),
    );
  });

  it("stored objects cannot be overwritten or deleted by users", async () => {
    const { data } = await addFile(asM, datasetId, COLUMNS);
    const overwrite = await asM.storage
      .from(BUCKET)
      .upload(data!.storage_path, new Blob(["x"], { type: "text/csv" }), {
        contentType: "text/csv",
        upsert: true,
      });
    expect(overwrite.error).not.toBeNull();
    const removed = await asM.storage.from(BUCKET).remove([data!.storage_path]);
    expect(removed.data ?? []).toEqual([]);
    const still = await asM.storage.from(BUCKET).download(data!.storage_path);
    expect(still.error).toBeNull();
  });
});
