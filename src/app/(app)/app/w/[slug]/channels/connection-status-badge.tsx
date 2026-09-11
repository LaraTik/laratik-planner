import { CircleCheck, CircleAlert, CircleX, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import type { LocaleCode } from "@/lib/i18n/locales";

type Translator = (key: string, params?: Record<string, string | number>) => string;

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

const SYNC_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function ConnectionStatusBadge({
  status,
  lastSyncedAt,
  variant = "outline",
  locale = "en",
  t,
}: {
  status: ConnectionStatus;
  lastSyncedAt?: Date | null;
  variant?: "outline" | "success" | "warning" | "danger";
  locale?: LocaleCode;
  t?: Translator;
}) {
  // A connected channel that has not synced within the documented 36-hour
  // window must not look healthy. The page is refreshed when the user visits
  // it, so a render-time check is enough and keeps the status derived from
  // the same timestamp shown below.
  const now = new Date();
  const stale =
    status === "connected" &&
    lastSyncedAt !== null &&
    lastSyncedAt !== undefined &&
    now.getTime() - lastSyncedAt.getTime() > SYNC_STALE_AFTER_MS;
  const effective: ConnectionStatus = stale ? "sync_error" : status;
  const effectiveMeta = STATUS_COPY[effective];
  const label = t ? t(`users.channels.connectionStatus.${effective}.label`) : effectiveMeta.label;
  const EffectiveIcon = effectiveMeta.icon;
  return (
    <span
      className="inline-flex flex-col items-start gap-1"
      data-testid={`connection-status-${status}`}
    >
      <Badge variant={variant}>
        <EffectiveIcon className="h-3 w-3" aria-hidden={true} />
        {label}
      </Badge>
      {lastSyncedAt ? (
        <span
          className="text-label text-fg-muted"
          aria-label={
            t
              ? t("users.channels.connectionStatus.lastSynced", {
                  when: formatRelativeDate(lastSyncedAt, now, locale),
                })
              : `Last synced ${formatRelativeDate(lastSyncedAt, now, locale)}`
          }
        >
          {t
            ? t("users.channels.connectionStatus.synced", {
                when: formatRelativeDate(lastSyncedAt, now, locale),
              })
            : `Synced ${formatRelativeDate(lastSyncedAt, now, locale)}`}
        </span>
      ) : status === "connected" ? (
        <span className="text-label text-fg-muted">
          {t ? t("users.channels.connectionStatus.waiting") : "Waiting for first sync"}
        </span>
      ) : null}
    </span>
  );
}

// Re-export the icon-only dot for use in compact contexts (e.g.,
// the workspace overview). Not used in the channels table itself.
export function ConnectionStatusDot({ status, t }: { status: ConnectionStatus; t?: Translator }) {
  const Icon = STATUS_COPY[status].icon;
  return (
    <span
      className="inline-flex h-3 w-3 items-center justify-center"
      title={t ? t(`users.channels.connectionStatus.${status}.label`) : STATUS_COPY[status].label}
      aria-label={
        t
          ? t(`users.channels.connectionStatus.${status}.description`)
          : STATUS_COPY[status].description
      }
      data-testid={`connection-status-dot-${status}`}
    >
      <Icon className="h-3 w-3" aria-hidden={true} />
    </span>
  );
}
