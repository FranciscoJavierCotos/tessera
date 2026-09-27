"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DISCIPLINE_DESCRIPTIONS,
  DISCIPLINE_LABELS,
  DISCIPLINES,
  type Discipline,
} from "@/lib/profile/schema";

/** Radio cards for the five disciplines. Submits as `name`. */
export function DisciplinePicker({
  name = "discipline",
  value,
  onValueChange,
  defaultValue,
  labelledBy,
  describedBy,
  invalid,
}: {
  name?: string;
  value?: Discipline | null;
  onValueChange?: (value: Discipline) => void;
  defaultValue?: Discipline | null;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <RadioGroup
      name={name}
      // `null` means controlled with nothing picked yet; `undefined`, uncontrolled.
      value={value === undefined ? undefined : (value ?? "")}
      defaultValue={defaultValue ?? undefined}
      onValueChange={(v) => onValueChange?.(v as Discipline)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      required
    >
      {DISCIPLINES.map((discipline) => {
        const id = `${name}-${discipline}`;
        return (
          <Label
            key={discipline}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
          >
            <RadioGroupItem id={id} value={discipline} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">
                {DISCIPLINE_LABELS[discipline]}
              </span>
              <span className="text-sm text-muted-foreground">
                {DISCIPLINE_DESCRIPTIONS[discipline]}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
