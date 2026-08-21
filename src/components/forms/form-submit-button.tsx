"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * FormSubmitButton — submit button that disables + shows a
 * "pending" label while the form action is in flight.
 *
 * Centralises the useFormStatus dance so every form has the same
 * accessibility story (aria-busy on the button, disabled when
 * pending) and the same visual treatment (pending label suffix).
 *
 * Usage:
 *   <FormSubmitButton label="Save" pendingLabel="Saving…" />
 *   <FormSubmitButton label="Create draft" pendingLabel="Creating…" size="lg" />
 */
export interface FormSubmitButtonProps extends Omit<
  ButtonProps,
  "type" | "children" | "disabled" | "aria-busy"
> {
  label: React.ReactNode;
  pendingLabel?: React.ReactNode;
  /** When false, the pending label is never shown (useful for non-network forms). */
  showPending?: boolean;
}

export function FormSubmitButton({
  label,
  pendingLabel,
  showPending = true,
  size,
  variant,
  className,
  ...rest
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending && showPending && pendingLabel ? pendingLabel : label}
    </Button>
  );
}
