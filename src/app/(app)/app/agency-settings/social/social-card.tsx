"use client";

import * as React from "react";
import { useActionState } from "react";
import { Activity, AlertTriangle, Copy, KeyRound, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  disableSocialAction,
  enableSocialAction,
  resetSocialRecoveryAction,
  rotateSocialDekAction,
  type SocialActionState,
} from "./actions";

/**
 * M4.5 — social analytics card on the agency settings page.
 *
 * Renders one of four states:
 *   1. "Not enabled" + KEK missing — platform-config error banner;
 *      the Enable button is disabled with a clear reason.
 *   2. "Not enabled" + KEK available — Enable button + an
 *      explainer.
 *   3. "Enabled" — status summary (enabled date, key version,
 *      connection count, last rotation), Rotate / Disable / Reset
 *      actions.
 *   4. After enable / rotate — the recovery-key modal is shown
 *      (the `recoveryKey` local state carries the key + version).
 *
 * The recovery-key modal is the only place the DEK plaintext is
 * ever displayed. The checkbox + dismiss pattern is enforced
 * (Close is disabled until the user ticks "I have saved my
 * recovery key") so an admin cannot accidentally dismiss the
 * modal without copying the key.
 *
 * The status state is the source of truth: it is initialised
 * from the server-rendered `initialStatus` and is updated in the
 * action handlers' onSuccess path. We intentionally do NOT
 * useEffect on the action state to mirror it — the action
 * handler sets the state directly.
 */

type SocialStatus = {
  enabled: boolean;
  dekKeyVersion: number | undefined;
  enabledAt: string | undefined;
  lastRotatedAt: string | null | undefined;
  rotationReason: string | null | undefined;
  connectionCount: number;
  platformKekAvailable: boolean;
};

const initial: SocialActionState = {};

export function SocialCard({
  agencyId,
  initialStatus,
  t,
}: {
  agencyId: string;
  initialStatus: SocialStatus;
  /**
   * Optional translator. When provided, the destructive-modal titles +
   * bodies render from `agencySocial.{disableTitle,disableBody,recoveryTitle,recoveryBody}`;
   * when omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  const [status, setStatus] = React.useState<SocialStatus>(initialStatus);
  const [recoveryKey, setRecoveryKey] = React.useState<{
    key: string;
    version: number;
    source: "enable" | "rotate";
  } | null>(null);
  const [showDisableModal, setShowDisableModal] = React.useState(false);
  const [showResetModal, setShowResetModal] = React.useState(false);

  const handleEnableResult = React.useCallback((next: SocialActionState) => {
    if (next.ok && next.dekRecoveryKey) {
      setRecoveryKey({
        key: next.dekRecoveryKey,
        version: next.dekKeyVersion ?? 1,
        source: "enable",
      });
      setStatus((s) => ({
        ...s,
        enabled: true,
        dekKeyVersion: next.dekKeyVersion,
        enabledAt: new Date().toISOString(),
        lastRotatedAt: undefined,
        rotationReason: undefined,
        connectionCount: 0,
      }));
    }
  }, []);

  const handleRotateResult = React.useCallback((next: SocialActionState) => {
    if (next.ok && next.dekRecoveryKey) {
      setRecoveryKey({
        key: next.dekRecoveryKey,
        version: next.dekKeyVersion ?? 1,
        source: "rotate",
      });
      setStatus((s) => ({
        ...s,
        dekKeyVersion: next.dekKeyVersion,
        lastRotatedAt: new Date().toISOString(),
        rotationReason: "manual",
      }));
    }
  }, []);

  const handleDisableResult = React.useCallback(
    (next: SocialActionState, kekAvailable: boolean) => {
      if (next.ok) {
        setStatus({
          enabled: false,
          dekKeyVersion: undefined,
          enabledAt: undefined,
          lastRotatedAt: undefined,
          rotationReason: undefined,
          connectionCount: 0,
          platformKekAvailable: kekAvailable,
        });
        setShowDisableModal(false);
      }
    },
    [],
  );

  const handleResetResult = React.useCallback((next: SocialActionState, kekAvailable: boolean) => {
    if (next.ok) {
      setStatus({
        enabled: false,
        dekKeyVersion: undefined,
        enabledAt: undefined,
        lastRotatedAt: undefined,
        rotationReason: undefined,
        connectionCount: 0,
        platformKekAvailable: kekAvailable,
      });
      setShowResetModal(false);
    }
  }, []);

  // Use the [formAction] shape so we can intercept the result
  // and update local state. This avoids the set-state-in-effect
  // antipattern.
  const [enableState, enableRawAction, enablePending] = useActionState(enableSocialAction, initial);
  const [rotateState, rotateRawAction, rotatePending] = useActionState(
    rotateSocialDekAction,
    initial,
  );
  const [disableState, disableRawAction, disablePending] = useActionState(
    disableSocialAction,
    initial,
  );
  const [resetState, resetRawAction, resetPending] = useActionState(
    resetSocialRecoveryAction,
    initial,
  );

  const enableAction: React.FormEventHandler<HTMLFormElement> = React.useCallback(
    (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      void (async () => {
        const result = await enableSocialAction(initial, fd);
        handleEnableResult(result);
      })();
    },
    [handleEnableResult],
  );
  const rotateAction: React.FormEventHandler<HTMLFormElement> = React.useCallback(
    (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      void (async () => {
        const result = await rotateSocialDekAction(initial, fd);
        handleRotateResult(result);
      })();
    },
    [handleRotateResult],
  );
  const disableAction: React.FormEventHandler<HTMLFormElement> = React.useCallback(
    (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      void (async () => {
        const result = await disableSocialAction(initial, fd);
        handleDisableResult(result, status.platformKekAvailable);
      })();
    },
    [handleDisableResult, status.platformKekAvailable],
  );
  const resetAction: React.FormEventHandler<HTMLFormElement> = React.useCallback(
    (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      void (async () => {
        const result = await resetSocialRecoveryAction(initial, fd);
        handleResetResult(result, status.platformKekAvailable);
      })();
    },
    [handleResetResult, status.platformKekAvailable],
  );

  // Touch the unused-raw-action state to keep the lint rule
  // (these are the action functions that the underlying
  // useActionState pattern returns; we use the wrapped versions
  // above).
  void enableRawAction;
  void rotateRawAction;
  void disableRawAction;
  void resetRawAction;

  const lastError =
    enableState.error ?? rotateState.error ?? disableState.error ?? resetState.error ?? null;

  return (
    <>
      <Card data-testid="agency-social-card">
        <div className="text-primary mb-2 flex items-center gap-2">
          <Activity className="h-5 w-5" aria-hidden="true" />
          <CardTitle>Social analytics</CardTitle>
          {status.enabled ? (
            <Badge variant="success" data-testid="agency-social-enabled-badge">
              Enabled
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="agency-social-disabled-badge">
              Not enabled
            </Badge>
          )}
        </div>
        <CardDescription className="mb-4">
          Connect Meta (Facebook / Instagram) and TikTok to track follower counts, reach, and
          engagement for every channel in this agency. Tokens are encrypted at rest with a
          per-agency key.
        </CardDescription>

        {!status.platformKekAvailable && (
          <div
            className="border-border bg-warning-soft text-body text-fg-primary mb-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
            data-testid="agency-social-kek-missing-banner"
            role="alert"
          >
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Platform KEK not configured</p>
              <p className="text-fg-secondary mt-1">
                The platform administrator must set the <code>SOCIAL_TOKEN_ENCRYPTION_KEY</code>{" "}
                environment variable before agencies can enable social analytics. Generate one with:{" "}
                <code className="bg-surface rounded px-1.5 py-0.5">openssl rand -base64 32</code>
              </p>
            </div>
          </div>
        )}

        {lastError && (
          <div
            className="border-border bg-danger-soft text-body text-fg-primary mb-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
            data-testid="agency-social-error-banner"
            role="alert"
          >
            <AlertTriangle className="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{lastError}</p>
          </div>
        )}

        {status.enabled ? (
          <EnabledBody
            agencyId={agencyId}
            status={status}
            rotating={rotatePending}
            rotateAction={rotateAction}
            onDisableClick={() => setShowDisableModal(true)}
            onResetRecoveryClick={() => setShowResetModal(true)}
          />
        ) : (
          <DisabledBody
            agencyId={agencyId}
            kekAvailable={status.platformKekAvailable}
            enabling={enablePending}
            enableAction={enableAction}
          />
        )}
      </Card>

      {recoveryKey && (
        <RecoveryKeyModal
          recoveryKey={recoveryKey.key}
          dekKeyVersion={recoveryKey.version}
          onClose={() => setRecoveryKey(null)}
        />
      )}

      {showDisableModal && (
        <ConfirmDestructiveModal
          testId="agency-social-disable-modal"
          title={tr("agencySocial.disableTitle", "Disable social analytics?")}
          body={tr(
            "agencySocial.disableBody",
            "All Meta and TikTok connections for this agency will be disconnected. Audit and metric history are preserved. This cannot be undone — you will need to re-onboard every connection to use social analytics again.",
          )}
          confirmLabel="Disable social analytics"
          agencyId={agencyId}
          action={disableAction}
          pending={disablePending}
          onClose={() => setShowDisableModal(false)}
        />
      )}

      {showResetModal && (
        <ConfirmDestructiveModal
          testId="agency-social-reset-recovery-modal"
          title={tr("agencySocial.recoveryTitle", "Lost your recovery key?")}
          body={tr(
            "agencySocial.recoveryBody",
            "This will disconnect every Meta and TikTok connection for this agency and generate a fresh DEK. Audit and metric history are preserved. You will need to reconnect every account after. This cannot be undone.",
          )}
          confirmLabel="Disconnect all and reset DEK"
          agencyId={agencyId}
          action={resetAction}
          pending={resetPending}
          onClose={() => setShowResetModal(false)}
        />
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function DisabledBody({
  agencyId,
  kekAvailable,
  enabling,
  enableAction,
}: {
  agencyId: string;
  kekAvailable: boolean;
  enabling: boolean;
  enableAction: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={enableAction} className="space-y-4">
      <p className="text-body text-fg-secondary">
        Enabling social analytics generates a per-agency encryption key. You will be shown a
        one-time recovery key to save in your password manager. The key is never shown again —
        losing it requires reconnecting every account.
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={!kekAvailable || enabling}
          data-testid="agency-social-enable-button"
        >
          {enabling ? "Enabling…" : "Enable social analytics"}
        </Button>
        {!kekAvailable && (
          <span className="text-label text-fg-muted">
            Waiting for the platform administrator to set the KEK.
          </span>
        )}
      </div>
      <input type="hidden" name="agencyId" value={agencyId} />
    </form>
  );
}

function EnabledBody({
  agencyId,
  status,
  rotating,
  rotateAction,
  onDisableClick,
  onResetRecoveryClick,
}: {
  agencyId: string;
  status: SocialStatus;
  rotating: boolean;
  rotateAction: React.FormEventHandler<HTMLFormElement>;
  onDisableClick: () => void;
  onResetRecoveryClick: () => void;
}) {
  return (
    <form onSubmit={rotateAction} className="space-y-4">
      <dl className="text-body space-y-2">
        {status.enabledAt && (
          <div className="flex justify-between gap-2">
            <dt className="text-fg-secondary">Enabled since</dt>
            <dd className="font-semibold">{new Date(status.enabledAt).toLocaleString()}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-fg-secondary">Key version</dt>
          <dd className="font-semibold" data-testid="agency-social-dek-version">
            {status.dekKeyVersion ?? 1}
          </dd>
        </div>
        {status.lastRotatedAt && (
          <div className="flex justify-between gap-2">
            <dt className="text-fg-secondary">Last rotated</dt>
            <dd className="font-semibold">{new Date(status.lastRotatedAt).toLocaleString()}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-fg-secondary">Connections</dt>
          <dd className="font-semibold" data-testid="agency-social-connection-count">
            {status.connectionCount}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="default"
          disabled={rotating}
          data-testid="agency-social-rotate-button"
        >
          <RotateCcw className="me-1.5 h-4 w-4" aria-hidden="true" />
          {rotating ? "Rotating…" : "Rotate DEK"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onResetRecoveryClick}
          data-testid="agency-social-reset-recovery-button"
        >
          <KeyRound className="me-1.5 h-4 w-4" aria-hidden="true" />I lost my recovery key
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDisableClick}
          data-testid="agency-social-disable-button"
        >
          <ShieldAlert className="me-1.5 h-4 w-4" aria-hidden="true" />
          Disable
        </Button>
      </div>
      <input type="hidden" name="agencyId" value={agencyId} />
    </form>
  );
}

function RecoveryKeyModal({
  recoveryKey,
  dekKeyVersion,
  onClose,
}: {
  recoveryKey: string;
  dekKeyVersion: number;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // UX-03 — closing via the X button or the backdrop requires the same
  // checkbox tick. We prevent the dismiss so the user can never
  // accidentally lose the one-time recovery key. Radix exposes
  // `onInteractOutside` and `onEscapeKeyDown` for this; both default
  // to firing `onOpenChange(false)`, which we short-circuit here.
  const blockDismiss = (e: Event) => {
    if (!confirmed) e.preventDefault();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Only allow programmatic close when the user has confirmed.
        if (!next && !confirmed) return;
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-testid="agency-social-recovery-key-modal"
        onInteractOutside={blockDismiss}
        onEscapeKeyDown={blockDismiss}
        onPointerDownOutside={blockDismiss}
      >
        <DialogHeader>
          <DialogTitle>Save your recovery key</DialogTitle>
          <DialogDescription>
            This key decrypts your agency&apos;s social connection tokens. It will not be shown
            again. Save it in your password manager before closing this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-surface-subtle border-border flex items-center gap-2 rounded-[var(--radius-control)] border p-3">
          <code
            className="text-body text-fg-primary flex-1 overflow-x-auto font-mono break-all whitespace-pre"
            data-testid="agency-social-recovery-key-value"
          >
            {recoveryKey}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            data-testid="agency-social-recovery-key-copy"
          >
            <Copy className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-label text-fg-muted">
          Key version {dekKeyVersion}. The DEK is wrapped by the platform KEK at rest.
        </p>
        <div className="flex items-start gap-2">
          <input
            id="agency-social-recovery-key-confirm"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            data-testid="agency-social-recovery-key-confirm"
            className="border-border text-primary mt-1 h-4 w-4 rounded-[var(--radius-control)] border focus:ring-2 focus:ring-offset-1 focus:outline-none"
          />
          <Label htmlFor="agency-social-recovery-key-confirm" className="text-body">
            I have saved the recovery key in my password manager.
          </Label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={!confirmed}
            onClick={onClose}
            data-testid="agency-social-recovery-key-close"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDestructiveModal({
  testId,
  title,
  body,
  confirmLabel,
  agencyId,
  action,
  pending,
  onClose,
}: {
  testId: string;
  title: string;
  body: string;
  confirmLabel: string;
  agencyId: string;
  action: React.FormEventHandler<HTMLFormElement>;
  pending: boolean;
  onClose: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  // Use the last 6 hex chars of the agency id as a weak
  // confirmation token — not a security boundary, but a
  // friction step. Replace with the full slug in a future pass.
  const expected = agencyId.slice(-6);
  const canConfirm = typed === expected;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canConfirm) return;
    action(e);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${testId}-confirm`} className="text-body">
              Type the last 6 characters of the agency id (<code>{expected}</code>) to confirm:
            </Label>
            <input
              id={`${testId}-confirm`}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="border-border bg-surface text-body w-full rounded-[var(--radius-control)] border px-3 py-2 font-mono"
              data-testid={`${testId}-confirm-input`}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid={`${testId}-cancel`}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canConfirm || pending}
              data-testid={`${testId}-submit`}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
