"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/**
 * Sonner — thin wrapper around the shadcn/ui Toaster primitive.
 *
 * We mount exactly one instance at the root (`src/app/layout.tsx`)
 * and pass design-token-aware defaults so any client component can
 * call `toast.success(...)` / `toast.error(...)` / `toast(...)`
 * without owning a host.
 *
 * Token alignment:
 *   - `bg-surface text-fg-primary` keeps the toast on-brand in both
 *     light and dark modes (Sonner renders inline styles by default,
 *     so we override via the `toastOptions.unstyled: false` path and
 *     pass className strings through `toastOptions.classNames`).
 *   - The default `position="bottom-right"` is the least
 *     occluding spot on a Bento grid page; on small viewports the
 *     Sonner stylesheet auto-centers.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      expand
      visibleToasts={4}
      duration={5000}
      toastOptions={{
        classNames: {
          toast: "border-border bg-surface text-fg-primary rounded-[var(--radius-card)] shadow-lg",
          title: "text-body text-fg-primary font-semibold",
          description: "text-label text-fg-secondary",
          actionButton: "bg-primary text-white",
          cancelButton: "bg-surface-subtle text-fg-primary",
          error: "border-danger/20 bg-danger-subtle text-danger",
          success: "border-success/20 bg-success-subtle text-success",
          warning: "border-warning/20 bg-warning-subtle text-warning",
          info: "border-info/20 bg-info-subtle text-info",
        },
      }}
      {...props}
    />
  );
}
