"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ASSET_KIND_ICONS } from "@/components/asset/asset-badges";
import { TagsInput } from "@/components/asset/tags-input";
import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSET_KIND_DESCRIPTIONS,
  ASSET_KIND_LABELS,
  ASSET_KINDS,
  DASHBOARD_TOOL_LABELS,
  DASHBOARD_TOOLS,
  QUALIFIED_NAME_EXAMPLES,
  type AssetKind,
  type DashboardTool,
} from "@/lib/asset/kinds";
import {
  MAX_ASSET_DESCRIPTION,
  MAX_ASSET_NAME,
  MAX_PROPERTY_TEXT,
  MAX_QUALIFIED_NAME,
  suggestQualifiedName,
  type AssetProperties,
  type ColumnInput,
} from "@/lib/asset/schema";
import type { MemberOption } from "@/lib/asset/server";
import type { FormState } from "@/lib/forms";

import { createAsset, updateAsset } from "./actions";
import { ColumnsEditor } from "./columns-editor";

const idle: FormState = { status: "idle" };

export type AssetFormValues = {
  kind: AssetKind;
  name: string;
  qualifiedName: string;
  description: string;
  ownerId: string;
  tags: string[];
  properties: AssetProperties;
  columns: ColumnInput[];
};

/**
 * Registers an asset, or edits one when `assetId` is set (its kind is then
 * fixed). For kinds other than datasets the qualified name follows the name
 * until the user edits it.
 */
export function AssetForm({
  workspace,
  assetId,
  initial,
  owners,
  cancelHref,
}: {
  workspace: { id: string; slug: string };
  assetId?: string;
  initial: AssetFormValues;
  owners: MemberOption[];
  cancelHref: string;
}) {
  const editing = Boolean(assetId);
  const [state, action] = useActionState(
    editing ? updateAsset : createAsset,
    idle,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const [kind, setKind] = useState(initial.kind);
  const [name, setName] = useState(initial.name);
  const [qualifiedName, setQualifiedName] = useState(initial.qualifiedName);
  const [qualifiedNameEdited, setQualifiedNameEdited] = useState(editing);
  const [description, setDescription] = useState(initial.description);
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [url, setUrl] = useState(initial.properties.url ?? "");
  const [tool, setTool] = useState<DashboardTool | "">(
    initial.properties.tool ?? "",
  );
  const [system, setSystem] = useState(initial.properties.system ?? "");
  const [framework, setFramework] = useState(
    initial.properties.framework ?? "",
  );

  const describedBy = (field: string, hint?: string) =>
    [errors?.[field] ? `asset-${field}-error` : null, hint]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>
            {editing ? "Could not save the asset" : "Could not add the asset"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <input type="hidden" name="workspaceSlug" value={workspace.slug} />
      {assetId && <input type="hidden" name="assetId" value={assetId} />}
      <input type="hidden" name="kind" value={kind} />

      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend id="asset-kind-label" className="mb-2 text-sm font-medium">
            Kind
          </legend>
          <RadioGroup
            value={kind}
            onValueChange={(value) => {
              setKind(value as AssetKind);
              if (!qualifiedNameEdited) {
                setQualifiedName(
                  value === "dataset" ? "" : suggestQualifiedName(name),
                );
              }
            }}
            aria-labelledby="asset-kind-label"
            className="grid gap-2 sm:grid-cols-2"
          >
            {ASSET_KINDS.map((k) => {
              const id = `asset-kind-${k}`;
              const Icon = ASSET_KIND_ICONS[k];
              return (
                <Label
                  key={k}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-checked:border-primary has-data-checked:ring-1 has-data-checked:ring-primary"
                >
                  <RadioGroupItem id={id} value={k} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Icon aria-hidden className="size-4" />
                      {ASSET_KIND_LABELS[k]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {ASSET_KIND_DESCRIPTIONS[k]}
                    </span>
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-name">Name</Label>
        <Input
          id="asset-name"
          name="name"
          maxLength={MAX_ASSET_NAME}
          placeholder={kind === "dataset" ? "Orders" : "Revenue overview"}
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!qualifiedNameEdited && kind !== "dataset") {
              setQualifiedName(suggestQualifiedName(event.target.value));
            }
          }}
          aria-invalid={Boolean(errors?.name) || undefined}
          aria-describedby={describedBy("name")}
        />
        <FieldError id="asset-name-error" message={errors?.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-qualifiedName">Qualified name</Label>
        <Input
          id="asset-qualifiedName"
          name="qualifiedName"
          maxLength={MAX_QUALIFIED_NAME}
          placeholder={QUALIFIED_NAME_EXAMPLES[kind]}
          required
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          value={qualifiedName}
          onChange={(event) => {
            setQualifiedName(event.target.value);
            setQualifiedNameEdited(true);
          }}
          aria-invalid={Boolean(errors?.qualifiedName) || undefined}
          aria-describedby={describedBy(
            "qualifiedName",
            "asset-qualifiedName-hint",
          )}
        />
        <p
          id="asset-qualifiedName-hint"
          className="text-xs text-muted-foreground"
        >
          {kind === "dataset"
            ? "Where it lives: db.schema.table. Unique in the workspace."
            : "A unique identifier in the workspace, such as tool.name."}
        </p>
        <FieldError
          id="asset-qualifiedName-error"
          message={errors?.qualifiedName}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-description">Description</Label>
        <Textarea
          id="asset-description"
          name="description"
          rows={6}
          maxLength={MAX_ASSET_DESCRIPTION}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What it is, how it is built and how to use it."
          aria-invalid={Boolean(errors?.description) || undefined}
          aria-describedby={describedBy(
            "description",
            "asset-description-hint",
          )}
        />
        <p
          id="asset-description-hint"
          className="text-xs text-muted-foreground"
        >
          Markdown is supported.
        </p>
        <FieldError
          id="asset-description-error"
          message={errors?.description}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="asset-ownerId">Owner</Label>
          <Select name="ownerId" value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger
              id="asset-ownerId"
              className="w-full"
              aria-invalid={Boolean(errors?.ownerId) || undefined}
              aria-describedby={describedBy("ownerId")}
            >
              <SelectValue placeholder="Choose an owner" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((owner) => (
                <SelectItem key={owner.userId} value={owner.userId}>
                  {owner.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="asset-ownerId-error" message={errors?.ownerId} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="asset-tags">Tags</Label>
          <TagsInput
            id="asset-tags"
            defaultValue={initial.tags}
            invalid={Boolean(errors?.tags)}
            describedBy={describedBy("tags")}
          />
          <FieldError
            id="asset-tags-error"
            message={
              errors?.tags ??
              Object.entries(errors ?? {}).find(([key]) =>
                key.startsWith("tags."),
              )?.[1]
            }
          />
        </div>
      </div>

      {kind === "dashboard" && (
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <UrlField
            label="Dashboard URL"
            value={url}
            onChange={setUrl}
            error={errors?.["properties.url"]}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-tool">Tool</Label>
            <Select
              name="tool"
              value={tool}
              onValueChange={(value) => setTool(value as DashboardTool)}
            >
              <SelectTrigger
                id="asset-tool"
                className="w-full"
                aria-invalid={Boolean(errors?.["properties.tool"]) || undefined}
                aria-describedby={
                  errors?.["properties.tool"] ? "asset-tool-error" : undefined
                }
              >
                <SelectValue placeholder="Choose a tool" />
              </SelectTrigger>
              <SelectContent>
                {DASHBOARD_TOOLS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DASHBOARD_TOOL_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError
              id="asset-tool-error"
              message={errors?.["properties.tool"]}
            />
          </div>
        </div>
      )}

      {kind === "source_system" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="asset-system"
            name="system"
            label="System"
            placeholder="PostgreSQL, Salesforce…"
            value={system}
            onChange={setSystem}
            error={errors?.["properties.system"]}
          />
          <UrlField
            label="Link"
            value={url}
            onChange={setUrl}
            error={errors?.["properties.url"]}
          />
        </div>
      )}

      {kind === "ml_model" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="asset-framework"
            name="framework"
            label="Framework"
            placeholder="scikit-learn, XGBoost…"
            value={framework}
            onChange={setFramework}
            error={errors?.["properties.framework"]}
          />
          <UrlField
            label="Registry link"
            value={url}
            onChange={setUrl}
            error={errors?.["properties.url"]}
          />
        </div>
      )}

      {kind === "dataset" && (
        <ColumnsEditor defaultValue={initial.columns} errors={errors} />
      )}

      <div className="flex justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel={editing ? "Saving…" : "Adding…"}>
          {editing ? "Save changes" : "Add to catalog"}
        </SubmitButton>
      </div>
    </form>
  );
}

function TextField({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
  error,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        maxLength={MAX_PROPERTY_TEXT}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function UrlField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="asset-url">{label}</Label>
      <Input
        id="asset-url"
        name="url"
        type="url"
        maxLength={500}
        placeholder="https://"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? "asset-url-error" : undefined}
      />
      <FieldError id="asset-url-error" message={error} />
    </div>
  );
}
