"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/** A submit button that shows a spinner while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      {...props}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
