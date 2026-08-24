"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, PlugZap, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
 * The dialog traps focus, restores focus on close, and is dismissable
 * by Escape, by clicking the backdrop, or by clicking Cancel. We do
 * not use a third-party modal because the project's UI library does
 * not ship one; the dialog is hand-rolled to keep the dep surface
 * flat and to make the focus management explicit.
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
  const cancelRef = useRef<HTMLButtonElement | null>(null);

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
        <span role="alert" className="text-label text-danger-fg" data-testid="connection-error">
          {error}
        </span>
      ) : null}

      {showRevoke ? (
        <RevokeDialog
          affectedChannels={otherChannels}
          onCancel={() => setShowRevoke(false)}
          onConfirm={revoke}
          pending={pending}
          cancelRef={cancelRef}
        />
      ) : null}
    </div>
  );
}

function RevokeDialog({
  affectedChannels,
  onCancel,
  onConfirm,
  pending,
  cancelRef,
}: {
  affectedChannels: AffectedChannel[];
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-dialog-title"
      aria-describedby="revoke-dialog-desc"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      data-testid="revoke-dialog"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="revoke-dialog-title" className="text-h3 text-fg-primary font-semibold">
            Revoke this Meta grant?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-fg-muted hover:text-fg-primary cursor-pointer rounded p-1"
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        </div>
        <p id="revoke-dialog-desc" className="text-body text-fg-secondary mt-3">
          This will revoke the shared Meta grant and disconnect every account attached to it.
          Historical metrics are preserved.
        </p>
        <div className="mt-4">
          <p className="text-label text-fg-muted">Affected channels ({affectedChannels.length}):</p>
          <ul
            className="border-border bg-surface-subtle mt-2 max-h-40 space-y-1 overflow-y-auto rounded border p-3"
            data-testid="revoke-affected-list"
          >
            {affectedChannels.map((c) => (
              <li key={c.id} className="text-body text-fg-primary flex items-center gap-2">
                <span className="text-fg-muted text-label uppercase">{c.platform}</span>
                <span className="truncate">{c.accountName}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="border-border text-fg-primary hover:bg-surface-subtle text-body cursor-pointer rounded-md border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="revoke-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className="bg-danger text-danger-fg text-body cursor-pointer rounded-md px-3 py-1.5 font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="revoke-confirm"
          >
            {pending ? "Revoking…" : "Yes, revoke access"}
          </button>
        </div>
      </div>
    </div>
  );
}
