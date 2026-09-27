"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Asks before doing something hard to undo. `trigger` opens it (a `Button`);
 * focus starts on Cancel and returns to the trigger when it closes.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
