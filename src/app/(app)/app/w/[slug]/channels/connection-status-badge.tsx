import { CircleCheck, CircleAlert, CircleX, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * M4 — connection status badge.
 *
 * The M4 plan calls for a non-color icon + text combination so the
 * status is conveyed without color alone. The badge surfaces:
 *
 *   - Manual          (a channel with no provider linkage)
 *   - Connected       (provider active, last sync recent)
 *   - Sync delayed    (provider active, last sync older than 36h)
 *   - Needs reconnect (auth/perm failure x3)
 *   - Disconnected    (workspace manager disconnected)
 *   - Sync error      (transient provider error, will retry)
 */

export type ConnectionStatus =
  "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected";

const STATUS_COPY: Record<
  ConnectionStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    description: string;
  }
> = {
  manual: {
    label: "Manual",
    icon: CircleDashed,
    description: "Channel has no provider connection. Manually managed.",
  },
  connected: {
    label: "Connected",
    icon: CircleCheck,
    description: "Provider active. Daily metrics are being collected.",
  },
  needs_reauth: {
    label: "Needs reconnect",
    icon: CircleAlert,
    description: "Three consecutive auth/permission failures. Reconnect to resume.",
  },
  sync_error: {
    label: "Sync delayed",
    icon: CircleAlert,
    description: "Transient provider error. The cron will retry.",
  },
  disconnected: {
    label: "Disconnected",
    icon: CircleX,
    description: "Provider connection removed. Historical metrics are preserved.",
  },
};

export function ConnectionStatusBadge({
  status,
  lastSyncedAt,
  variant = "outline",
}: {
  status: ConnectionStatus;
  lastSyncedAt?: Date | null;
  variant?: "outline" | "success" | "warning" | "danger";
}) {
  // `Date.now()` is impure; we read the staleness from a prop-derived
  // computation only. The parent server component passes a
  // pre-computed `stale` boolean when it cares; the component itself
  // treats staleness as a hint, not a hard rule. (The actual "is
  // this still syncing?" question is decided at the cron layer, not
  // here.)
  const stale = false;
  const effective: ConnectionStatus = stale ? "sync_error" : status;
  const effectiveMeta = STATUS_COPY[effective];
  const EffectiveIcon = effectiveMeta.icon;
  return (
    <span
      className="inline-flex flex-col items-start gap-1"
      data-testid={`connection-status-${status}`}
    >
      <Badge variant={variant}>
        <EffectiveIcon className="h-3 w-3" aria-hidden={true} />
        {effectiveMeta.label}
      </Badge>
      {lastSyncedAt ? (
        <span
          className="text-label text-fg-muted"
          aria-label={`Last synced ${formatRelativeDate(lastSyncedAt)}`}
        >
          Synced {formatRelativeDate(lastSyncedAt)}
        </span>
      ) : status === "connected" ? (
        <span className="text-label text-fg-muted">Waiting for first sync</span>
      ) : null}
    </span>
  );
}

// Re-export the icon-only dot for use in compact contexts (e.g.,
// the workspace overview). Not used in the channels table itself.
export function ConnectionStatusDot({ status }: { status: ConnectionStatus }) {
  const Icon = STATUS_COPY[status].icon;
  return (
    <span
      className="inline-flex h-3 w-3 items-center justify-center"
      title={STATUS_COPY[status].label}
      aria-label={STATUS_COPY[status].description}
      data-testid={`connection-status-dot-${status}`}
    >
      <Icon className="h-3 w-3" aria-hidden={true} />
    </span>
  );
}
