import * as React from "react";
import { Clock } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * LastSaved — a compact "saved X ago" indicator rendered at the
 * bottom of every per-section settings form. The page server
 * component reads `workspace_settings.updatedAt` and passes the
 * Date through; the indicator renders nothing when the date is
 * missing (the row was never written — defaults applied).
 */
export function LastSaved({ at }: { at: Date | null | undefined }) {
  if (!at) {
    return (
      <p
        className="text-label text-fg-muted inline-flex items-center gap-1"
        data-testid="settings-last-saved"
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        Defaults applied — never edited.
      </p>
    );
  }
  return (
    <p
      className="text-label text-fg-muted inline-flex items-center gap-1"
      data-testid="settings-last-saved"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      <span>
        Last saved <span className="text-fg-secondary font-semibold">{formatRelativeDate(at)}</span>
      </span>
    </p>
  );
}
