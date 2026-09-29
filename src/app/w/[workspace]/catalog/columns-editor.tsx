"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ColumnInput } from "@/lib/asset/schema";
import {
  MAX_COLUMN_DESCRIPTION,
  MAX_COLUMN_NAME,
  MAX_COLUMN_TYPE,
  MAX_COLUMNS,
} from "@/lib/asset/schema";
import type { FieldErrors } from "@/lib/forms";

type Row = ColumnInput & { key: number };

/**
 * Edits a dataset's columns in order: name, type, description and a PII
 * flag. Submits them as JSON in a hidden `columns` input.
 */
export function ColumnsEditor({
  defaultValue,
  errors,
}: {
  defaultValue: ColumnInput[];
  errors?: FieldErrors;
}) {
  const nextKey = useRef(defaultValue.length);
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValue.map((column, key) => ({ ...column, key })),
  );

  const update = (key: number, patch: Partial<ColumnInput>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });
  const add = () =>
    setRows((current) => [
      ...current,
      {
        key: nextKey.current++,
        name: "",
        dataType: "",
        description: "",
        isPii: false,
      },
    ]);

  const payload = rows.map(({ name, dataType, description, isPii }) => ({
    name,
    dataType,
    description,
    isPii,
  }));

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="columns-hint">
      <legend className="mb-1 text-sm font-medium">Columns</legend>
      <p id="columns-hint" className="text-xs text-muted-foreground">
        In table order. Flag columns that hold personal data as PII.
      </p>
      <input type="hidden" name="columns" value={JSON.stringify(payload)} />
      <FieldError id="columns-error" message={errors?.columns} />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No columns yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const n = index + 1;
            const nameError = errors?.[`columns.${index}.name`];
            const typeError = errors?.[`columns.${index}.dataType`];
            const descriptionError = errors?.[`columns.${index}.description`];
            const id = `column-${row.key}`;
            return (
              <li
                key={row.key}
                className="flex flex-col gap-2 rounded-lg border p-3"
                aria-label={`Column ${n}${row.name ? `: ${row.name}` : ""}`}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-name`} className="sr-only">
                      Column {n} name
                    </Label>
                    <Input
                      id={`${id}-name`}
                      value={row.name}
                      maxLength={MAX_COLUMN_NAME}
                      placeholder="column_name"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="font-mono"
                      onChange={(e) =>
                        update(row.key, { name: e.target.value })
                      }
                      aria-invalid={Boolean(nameError) || undefined}
                      aria-describedby={
                        nameError ? `${id}-name-error` : undefined
                      }
                    />
                    <FieldError id={`${id}-name-error`} message={nameError} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-type`} className="sr-only">
                      Column {n} type
                    </Label>
                    <Input
                      id={`${id}-type`}
                      value={row.dataType}
                      maxLength={MAX_COLUMN_TYPE}
                      placeholder="type"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="font-mono"
                      onChange={(e) =>
                        update(row.key, { dataType: e.target.value })
                      }
                      aria-invalid={Boolean(typeError) || undefined}
                      aria-describedby={
                        typeError ? `${id}-type-error` : undefined
                      }
                    />
                    <FieldError id={`${id}-type-error`} message={typeError} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${id}-description`} className="sr-only">
                    Column {n} description
                  </Label>
                  <Input
                    id={`${id}-description`}
                    value={row.description}
                    maxLength={MAX_COLUMN_DESCRIPTION}
                    placeholder="What the column holds"
                    onChange={(e) =>
                      update(row.key, { description: e.target.value })
                    }
                    aria-invalid={Boolean(descriptionError) || undefined}
                    aria-describedby={
                      descriptionError ? `${id}-description-error` : undefined
                    }
                  />
                  <FieldError
                    id={`${id}-description-error`}
                    message={descriptionError}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-pii`}
                      checked={row.isPii}
                      onCheckedChange={(checked) =>
                        update(row.key, { isPii: checked === true })
                      }
                    />
                    <Label htmlFor={`${id}-pii`} className="font-normal">
                      Column {n} holds PII
                    </Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move column ${n} up`}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move column ${n} down`}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setRows((current) =>
                          current.filter((r) => r.key !== row.key),
                        )
                      }
                      aria-label={`Remove column ${n}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={rows.length >= MAX_COLUMNS}
        >
          <Plus aria-hidden />
          Add column
        </Button>
      </div>
    </fieldset>
  );
}
