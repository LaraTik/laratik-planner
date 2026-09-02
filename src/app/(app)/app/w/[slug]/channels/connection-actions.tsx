"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  disconnectChannelAction,
  revokeConnectionAction,
  testChannelConnectionAction,
} from "./actions";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { TEST_ERROR_COPY, type TestErrorCode } from "@/lib/social/test-error-codes";

/**
 * M4 — connection lifecycle client component.
 *
 * Renders the workspace-manager row of buttons for a single
 * connected channel:
 *
 *   - Re-test    — runs the same end-to-end pipeline the cron does
 *                  (refresh creds → fetchSnapshot → upsert metric →
 *                  markSyncSuccess) and surfaces the result inline.
 *                  On success, the row's `lastSyncedAt` advances
 *                  immediately and the user sees a "Validated just
 *                  now" flash. On failure, an inline error chip
 *                  shows the humanized error code. The button label
 *                  shifts between "Re-test" (connected) and "Sync
 *                  now" (delayed/error) so the affordance matches
 *                  what the user is trying to recover from.
 *   - Disconnect — clears the provider link, preserves the row ID
 *                  and the metric history. No confirm dialog: the
 *                  metric preservation is a soft guarantee, and the
 *                  action is recoverable by re-connecting.
 *   - Revoke     — only shown when the channel shares a connection
 *                  with at least one other channel. Triggers a
 *                  focus-managed confirmation dialog that lists
 *                  every affected channel. The revoke hits the
 *                  provider's revoke endpoint, marks the connection
 *                  `revoked`, and disconnects every attached channel
 *                  in one transaction.
 *
 * The dialog is built on the project's shared Radix-based
 * `Dialog` primitive (UX-03) — focus trap, Escape to close, and
 * focus restoration all come for free from Radix, so the only
 * responsibilities this file owns are the open-state toggle and
 * the action handler.
 */

type ChannelRow = {
  id: string;
  accountName: string;
  platform: "instagram" | "facebook" | "tiktok";
  socialConnectionId: string | null;
  connectionStatus: "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected";
};

type AffectedChannel = Pick<ChannelRow, "id" | "accountName" | "platform">;

type TestFlash =
  { kind: "success"; lastSyncedAt: Date } | { kind: "error"; errorCode: TestErrorCode };

type Translator = (key: string, params?: Record<string, string | number>) => string;

export function ConnectionActions({
  slug,
  channel,
  affectedChannels = [],
  t,
}: {
  slug: string;
  channel: ChannelRow;
  affectedChannels?: AffectedChannel[];
  /**
   * Optional translator. When provided, every user-visible string
   * (Re-test / Sync now button labels + pending labels,
   * Disconnect / Revoke buttons, the Validated {when} chip, the
   * Revoke-confirm dialog + the affected channels list label) renders
   * from `users.channelsConnectionActions.*`; when omitted, the
   * stored English copy is used.
   */
  t?: Translator;
}) {
  const localeT = useLocaleT();
  const locale = useLocaleCode();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : localeT(key, params) || fallback;
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<TestFlash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);

  function requestTest() {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const result = await testChannelConnectionAction(slug, channel.id);
      if ("errorCode" in result && result.errorCode) {
        setFlash({ kind: "error", errorCode: result.errorCode });
        return;
      }
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("success" in result && result.success && result.lastSyncedAt) {
        setFlash({
          kind: "success",
          lastSyncedAt: new Date(result.lastSyncedAt),
        });
      }
    });
  }

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectChannelAction(slug, channel.id);
      if ("error" in result && result.error) {
        setError(result.error);
      }
    });
  }

  function revoke() {
    if (!channel.socialConnectionId) {
      setError("This channel is not currently linked to a shared grant.");
      return;
    }
    const connectionId = channel.socialConnectionId;
    setShowRevoke(false);
    startTransition(async () => {
      const result = await revokeConnectionAction(slug, connectionId);
      if ("error" in result && result.error) {
        setError(result.error);
      }
    });
  }

  const otherChannels = affectedChannels.filter((c) => c.id !== channel.id);
  const isShared = otherChannels.length > 0;
  // "Sync now" is the right label when the connection is in a
  // degraded state (delayed sync / needs_reauth) — the user is
  // trying to recover, not just check. "Re-test" is the right label
  // for a healthy connection — the user is verifying, not kicking.
  const isHealthy =
    channel.connectionStatus === "connected" || channel.connectionStatus === "manual";
  const testLabel = isHealthy
    ? pending
      ? tr("users.channelsConnectionActions.retestValidating", "Validating…")
      : tr("users.channelsConnectionActions.retestLabel", "Re-test")
    : pending
      ? tr("users.channelsConnectionActions.retrying", "Retrying…")
      : tr("users.channelsConnectionActions.syncNow", "Sync now");

  return (
    <div className="flex flex-col items-end gap-1" data-testid="connection-actions">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || !channel.socialConnectionId}
          onClick={requestTest}
          aria-busy={pending}
          data-testid="retest-button"
        >
          <RefreshCw className="h-3 w-3" aria-hidden={true} />
          {testLabel}
        </Button>
        {channel.socialConnectionId ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={disconnect}
              data-testid="disconnect-button"
            >
              <PlugZap className="h-3 w-3" aria-hidden={true} />
              {tr("users.channelsConnectionActions.disconnect", "Disconnect")}
            </Button>
            {isShared ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => setShowRevoke(true)}
                data-testid="revoke-button"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden={true} />
                {tr("users.channelsConnectionActions.revoke", "Revoke")}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {flash?.kind === "success" ? (
        <span
          className="text-label text-fg-muted inline-flex items-center gap-1"
          aria-live="polite"
          data-testid="retest-success"
        >
          <Check className="text-success h-3 w-3" aria-hidden={true} />
          {tr(
            "users.channelsConnectionActions.validatedAt",
            `Validated ${formatRelativeDate(flash.lastSyncedAt, new Date(), locale)}`,
            { when: formatRelativeDate(flash.lastSyncedAt, new Date(), locale) },
          )}
        </span>
      ) : null}
      {flash?.kind === "error" ? (
        <span
          role="alert"
          className="text-label text-danger inline-flex items-center gap-1"
          data-testid="retest-error"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden={true} />
          {(() => {
            const copy = TEST_ERROR_COPY[flash.errorCode];
            return tr(copy.key, copy.fallback);
          })()}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-label text-danger" data-testid="connection-error">
          {error}
        </span>
      ) : null}

      <Dialog open={showRevoke} onOpenChange={setShowRevoke}>
        <DialogContent data-testid="revoke-dialog">
          <DialogHeader>
            <DialogTitle>
              {tr("users.channelsConnectionActions.revokeDialogTitle", "Revoke this Meta grant?")}
            </DialogTitle>
            <DialogDescription>
              {tr(
                "users.channelsConnectionActions.revokeDialogBody",
                "This will revoke the shared Meta grant and disconnect every account attached to it. Historical metrics are preserved.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="text-label text-fg-muted">
              {tr(
                "users.channelsConnectionActions.revokeAffectedLabel",
                `Affected channels (${otherChannels.length}):`,
                { count: otherChannels.length },
              )}
            </p>
            <ul
              className="border-border bg-surface-subtle mt-2 max-h-40 space-y-1 overflow-y-auto rounded border p-3"
              data-testid="revoke-affected-list"
            >
              {otherChannels.map((c) => (
                <li key={c.id} className="text-body text-fg-primary flex items-center gap-2">
                  <span className="text-fg-muted text-label uppercase">{c.platform}</span>
                  <span className="truncate">{c.accountName}</span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRevoke(false)}
              disabled={pending}
              data-testid="revoke-cancel"
            >
              {tr("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={revoke}
              disabled={pending}
              aria-busy={pending}
              data-testid="revoke-confirm"
            >
              {pending
                ? tr("users.channelsConnectionActions.revokePending", "Revoking…")
                : tr("users.channelsConnectionActions.revokeConfirm", "Yes, revoke access")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
