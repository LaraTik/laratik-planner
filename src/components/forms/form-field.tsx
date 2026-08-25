"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * FormField — accessible label + input + error/hint combo.
 * Built per master prompt §18 (labels always associated, errors announced).
 *
 * `children` may be any control that accepts the id / aria-* attributes
 * we inject: an `<Input>`, a native `<select>`, a native `<textarea>`,
 * etc. The structural type intentionally accepts the union of
 * `InputHTMLAttributes` and `TextareaHTMLAttributes` so that adding a
 * `<select>` consumer (a real use case at quick-create-form.tsx:43-58)
 * does not silently bypass the focus-ring / a11y contract — see
 * the GAP-FULL-REVIEW-2026-08-25 / UX-01 fix.
 */
type FieldControlProps = React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> &
  React.SelectHTMLAttributes<HTMLSelectElement>;

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<FieldControlProps>;
  className?: string;
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger ml-0.5">
            *
          </span>
        ) : null}
      </Label>
      {React.cloneElement(children, {
        id,
        ...(error ? { "aria-invalid": true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(required ? { "aria-required": true } : {}),
      })}
      {hint ? (
        <p id={hintId} className="text-label text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-label text-danger font-semibold" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
