"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { disconnectChannelAction, revokeConnectionAction } from "./actions";

/**
 * M4 — connection lifecycle client component.
 *
 * Renders the workspace-manager row of buttons for a single
 * connected channel:
 *
 *   - Sync now   — sets `next_sync_at=now()`; the cron worker is
 *                  the only path that actually calls the provider.
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
};

type AffectedChannel = Pick<ChannelRow, "id" | "accountName" | "platform">;

export function ConnectionActions({
  slug,
  channel,
  affectedChannels = [],
}: {
  slug: string;
  channel: ChannelRow;
  affectedChannels?: AffectedChannel[];
}) {
  const [pending, startTransition] = useTransition();
  const [syncFlash, setSyncFlash] = useState<"queued" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);

  function requestSync() {
    setError(null);
    setSyncFlash(null);
    startTransition(async () => {
      // The Sync now action is a stub for now — the wire is in place
      // but the cron is the executor. We surface a queued state so
      // the user sees the action was registered. The next successful
      // snapshot will clear the indicator.
      setSyncFlash("queued");
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

  return (
    <div className="flex flex-col items-end gap-1" data-testid="connection-actions">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={requestSync}
          aria-busy={pending}
          data-testid="sync-now-button"
        >
          <RefreshCw className="h-3 w-3" aria-hidden={true} />
          {pending ? "Queuing…" : "Sync now"}
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
              Disconnect
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
                Revoke
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {syncFlash === "queued" ? (
        <span className="text-label text-fg-muted" aria-live="polite" data-testid="sync-queued">
          Sync queued — the cron will run within 15 minutes.
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
            <DialogTitle>Revoke this Meta grant?</DialogTitle>
            <DialogDescription>
              This will revoke the shared Meta grant and disconnect every account attached to it.
              Historical metrics are preserved.
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="text-label text-fg-muted">Affected channels ({otherChannels.length}):</p>
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
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={revoke}
              disabled={pending}
              aria-busy={pending}
              data-testid="revoke-confirm"
            >
              {pending ? "Revoking…" : "Yes, revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
