"use client";

// Generic submit button for server-action forms (rule 10: every mutation
// button has a working state). While the surrounding form's action is
// pending it disables itself and swaps its label to `pendingLabel`.
// Reuse this for every later server-action form.
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function PendingButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
