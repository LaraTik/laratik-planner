import * as React from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnrichedOwner } from "@/lib/content/enriched-list";

/**
 * OwnerBadge — compact owner chip for the planning-list row.
 *
 * Shows the owner's avatar (initials tile when no avatar_path) + name.
 * When the row has no owner, renders a muted "Unassigned" pill so
 * the missing owner is visually discoverable (per Goal 33 #10 — the
 * list is an operational surface, not a navigation tree, and
 * unassigned items are actionable).
 *
 * Pure presentational component, server-renderable. No onClick
 * closure (per the RSC #441 lesson — see memory): if we ever want
 * the badge to be clickable, the parent should wrap it in a
 * client-side Link, not attach a handler here.
 */
export interface OwnerBadgeProps {
  owner: EnrichedOwner | null;
  /** Tailwind class additions for the surrounding <span>. */
  className?: string;
  /** Show the name in addition to the avatar. Default true. */
  showName?: boolean;
  /** Optional aria-label override (e.g. for tooltip tests). */
  ariaLabel?: string;
}

function initials(displayName: string): string {
  if (!displayName) return "?";
  const parts = displayName.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function OwnerBadge({ owner, className, showName = true, ariaLabel }: OwnerBadgeProps) {
  if (!owner) {
    return (
      <span
        className={cn(
          "border-border bg-surface-subtle text-label text-fg-muted inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
          className,
        )}
        data-testid="owner-badge"
        data-unassigned="true"
        aria-label={ariaLabel ?? "Unassigned"}
      >
        <User className="h-3 w-3" aria-hidden="true" />
        <span>Unassigned</span>
      </span>
    );
  }
  const label = ariaLabel ?? owner.displayName;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid="owner-badge"
      data-owner-id={owner.id}
      aria-label={label}
    >
      <span
        aria-hidden="true"
        className="border-border bg-surface-container text-fg-primary inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
      >
        {initials(owner.displayName)}
      </span>
      {showName ? (
        <span className="text-label text-fg-primary truncate font-medium">{owner.displayName}</span>
      ) : null}
    </span>
  );
}
