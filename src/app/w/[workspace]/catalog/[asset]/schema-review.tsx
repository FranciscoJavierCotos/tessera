"use client";

import { SchemaDiffList } from "@/components/asset/schema-diff-list";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MAX_COLUMN_DESCRIPTION, type ColumnInput } from "@/lib/asset/schema";
import { diffSchemas } from "@/lib/dataset-file/schema-diff";

/** The diff against the current columns, and the new columns' docs to edit. */
export function SchemaReview({
  current,
  proposed,
  onChange,
}: {
  current: ColumnInput[];
  proposed: ColumnInput[];
  onChange: (next: ColumnInput[]) => void;
}) {
  const diff = diffSchemas(current, proposed);
  const added = new Set(diff.added.map((c) => c.name));
  const update = (index: number, patch: Partial<ColumnInput>) =>
    onChange(proposed.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const typeChanges = diff.typeChanged.length;

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Summary of changes"
        className="flex flex-wrap gap-2 text-sm"
      >
        <li>
          <Badge variant="secondary">{diff.added.length} added</Badge>
        </li>
        <li>
          <Badge variant="secondary">{diff.removed.length} removed</Badge>
        </li>
        <li>
          <Badge variant="secondary">
            {typeChanges} {typeChanges === 1 ? "type change" : "type changes"}
          </Badge>
        </li>
        <li>
          <Badge variant="outline">{diff.unchanged.length} unchanged</Badge>
        </li>
      </ul>
      {(diff.added.length > 0 ||
        diff.removed.length > 0 ||
        typeChanges > 0) && (
        <SchemaDiffList diff={{ ...diff, metaChanged: [] }} warnOnLoss />
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Columns after the upload
        </legend>
        <ol className="flex flex-col divide-y rounded-xl border">
          {proposed.map((column, index) => (
            <li
              key={column.name}
              className="grid gap-2 p-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{column.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {column.dataType || "—"}
                </span>
                {added.has(column.name) && <Badge>New</Badge>}
              </span>
              <Input
                aria-label={`Description of ${column.name}`}
                value={column.description}
                maxLength={MAX_COLUMN_DESCRIPTION}
                placeholder="Description"
                onChange={(event) =>
                  update(index, { description: event.target.value })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-label={`${column.name} holds PII`}
                  checked={column.isPii}
                  onCheckedChange={(checked) =>
                    update(index, { isPii: checked === true })
                  }
                />
                PII
              </label>
            </li>
          ))}
        </ol>
      </fieldset>
    </div>
  );
}
