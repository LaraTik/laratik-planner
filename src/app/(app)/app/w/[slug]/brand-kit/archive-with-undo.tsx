"use client";

import * as React from "react";
import { useTransition } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * ArchiveWithUndo — drop-in replacement for the per-row archive
 * `<form>`/`<Button>` pair on the brand-kit page.
 *
 * Behaviour:
 *   1. User clicks the icon button.
 *   2. We start a `useTransition`, call the archive server action,
 *      and disable the button while it's in flight.
 *   3. On success, a Sonner toast appears with the item's name and an
 *      "Undo" action. The undo calls the corresponding restore
 *      server action (no re-archive needed; the page revalidates).
 *   4. On error, a destructive toast appears and the row stays put.
 *
 * The `useTransition` lets the server action return before the
 * `revalidatePath` lands, so the user sees the optimistic toast even
 * though the row hasn't visually disappeared from the section yet —
 * `revalidatePath` will refresh the page within ~1s.
 *
 * Round 5 (rebuild): the destructive action now uses the `<Trash2 />`
 * icon everywhere (locked by the brand-kit rebuild plan, 2026-08-26).
 * The previous `variant` prop (trash/archive) was inconsistent across
 * sections — three different icons for the same semantic action.
 * Locking to Trash2 simplifies the mental model and the a11y tree.
 *
 * Accessibility:
 *   - The icon button carries a descriptive `aria-label`.
 *   - The undo toast is keyboard-reachable (Sonner renders a button
 *     inside an `[aria-live="polite"]` region).
 *   - The 5s default toast duration gives the user enough time to
 *     undo without forcing them to act instantly.
 *
 * Props:
 *   - `slug`           — workspace slug, threaded through both actions
 *   - `id`             — the row id
 *   - `label`          — human-readable label for the toast ("Logo",
 *                        "Color", "Voice rule", etc.)
 *   - `name`           — the row's name; shown in the toast
 *   - `archiveAction`  — server action that flips `archived_at` to now
 *   - `restoreAction`  — server action that flips `archived_at` to null
 */
export interface ArchiveWithUndoProps {
  slug: string;
  id: string;
  label: string;
  name: string;
  archiveAction: (slug: string, id: string) => Promise<void>;
  restoreAction: (slug: string, id: string) => Promise<void>;
  "data-testid"?: string;
}

export function ArchiveWithUndo({
  slug,
  id,
  label,
  name,
  archiveAction,
  restoreAction,
  "data-testid": dataTestId,
}: ArchiveWithUndoProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await archiveAction(slug, id);
        const toastId = toast.success(`Archived ${label.toLowerCase()}: ${name}`, {
          description: "This will be removed permanently after 30 days.",
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              startTransition(async () => {
                try {
                  await restoreAction(slug, id);
                  toast.success(`Restored ${label.toLowerCase()}: ${name}`, {
                    id: `${id}-restored`,
                  });
                } catch (err) {
                  toast.error(`Couldn't restore ${label.toLowerCase()}`, {
                    description: err instanceof Error ? err.message : "Unknown error",
                  });
                }
              });
            },
          },
          actionButtonStyle: { gap: "0.5rem" },
        });
        // Tidy: keep the toast id reachable for tests.
        if (typeof window !== "undefined" && dataTestId) {
          window.setTimeout(() => {
            const el = document.querySelector(
              `[data-testid="${dataTestId}"]`,
            ) as HTMLElement | null;
            el?.setAttribute("data-toast-id", String(toastId));
          }, 0);
        }
      } catch (err) {
        toast.error(`Couldn't archive ${label.toLowerCase()}`, {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={isPending}
      aria-label={`Archive ${label.toLowerCase()} ${name}`}
      onClick={handleClick}
      data-testid={dataTestId}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

/** Re-export `Undo2` so the section-level bulk actions can reuse it. */
export { Undo2 };
