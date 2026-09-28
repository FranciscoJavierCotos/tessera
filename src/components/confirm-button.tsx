"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

/** A small destructive button that asks for confirmation first. */
export function ConfirmButton({
  label,
  accessibleLabel,
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  label: string;
  accessibleLabel?: string;
  title: string;
  description: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      destructive
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={accessibleLabel}
          className="text-destructive hover:text-destructive"
        >
          {label}
        </Button>
      }
    />
  );
}
