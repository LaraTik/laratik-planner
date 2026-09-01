"use client";

import * as React from "react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { archiveChannelAction, testChannelConnectionAction, updateChannelAction } from "./actions";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Channel edit form fields are kept inline here rather than extracted
 * into a shared `ChannelFields` component because the create form
 * (`channel-form.tsx`) and this drawer have meaningfully different
 * layouts:
 *   - create: 5-column responsive grid inline in a Card
 *   - edit:   single-column stacked inside a vertical-scroll drawer
 * Extracting a shared component would force the layouts to converge
 * and add a layer of indirection. The two definitions are <30 lines
 * each. // TODO: extract shared fields if a third surface (e.g. CSV
 * import) ever needs the same fields.
 */
type Channel = {
  id: string;
  platform: string;
  accountName: string;
  handle: string | null;
  url: string | null;
  accountType: string | null;
  isActive: boolean;
  socialConnectionId: string | null;
  lastSyncedAt: Date | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorAt: Date | null;
  connectionStatus: "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected";
};

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X" },
  { value: "pinterest", label: "Pinterest" },
  { value: "threads", label: "Threads" },
  { value: "other", label: "Custom" },
] as const;

type ActionState = { error?: string; success?: boolean };

type Translator = (key: string, params?: Record<string, string | number>) => string;

/**
 * Right-side drawer for editing a single social channel. The drawer
 * reuses the project's `Dialog` primitive with a custom `className` to
 * render as a sheet (right-anchored, full height, 520px max width)
 * matching the Stitch "Add social channel" design language.
 *
 * The parent controls `open` and re-renders the drawer with a fresh
 * `channel` prop when the user picks "Edit" from a row's kebab menu.
 * On successful submit, the `useEffect` below closes the drawer; the
 * action's `revalidatePath` refreshes the table so the user sees the
 * updated row immediately.
 */
export function ChannelEditDrawer({
  slug,
  channel,
  open,
  onOpenChange,
  t,
}: {
  slug: string;
  channel: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional translator. When provided, every user-visible string
   * (drawer title + description, field labels, placeholders, hints,
   * the inner ConnectionHealthSection, the action buttons, the
   * archive-confirm dialog + toast) renders from
   * `users.channelsEdit.*` + `users.channelsHealth.*` +
   * `users.channelsErrors.*`; when omitted, the stored English
   * copy is used.
   */
  t?: Translator;
}) {
  const localeT = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : localeT(key, params) || fallback;
  const boundAction = React.useMemo(
    () => updateChannelAction.bind(null, slug, channel.id),
    [slug, channel.id],
  );
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, {});

  // Re-test state. The result is captured locally so the user sees
  // "Validated just now" inline even if the page revalidation hasn't
  // returned the new `lastSyncedAt` to the drawer prop yet (the
  // parent re-mounts the drawer with the fresh row after revalidate,
  // but we want the chip to appear instantly).
  const [reTestPending, startReTest] = useTransition();
  const [reTestResult, setReTestResult] = useState<
    { kind: "success"; lastSyncedAt: string } | { kind: "error"; message: string } | null
  >(null);

  function reTest() {
    setReTestResult(null);
    startReTest(async () => {
      const result = await testChannelConnectionAction(slug, channel.id);
      if ("error" in result && result.error) {
        setReTestResult({ kind: "error", message: result.error });
        return;
      }
      if ("success" in result && result.success && result.lastSyncedAt) {
        setReTestResult({ kind: "success", lastSyncedAt: result.lastSyncedAt });
      }
    });
  }

  // Close the drawer when the server action reports success. The
  // revalidatePath in the action also refreshes the table.
  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
    }
  }, [state?.success, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Sheet (drawer) styling: right-anchored, full height, 520px
        // max width. The base DialogContent centers itself; we reset
        // every centering offset here. The built-in X close button
        // (rendered by DialogContent at `top-4 end-4`) lands in the
        // top-right corner, matching the Stitch header.
        className="bg-surface inset-y-0 end-0 top-0 left-auto m-0 h-screen w-screen max-w-[520px] translate-x-0 translate-y-0 overflow-hidden p-0 sm:rounded-none"
        data-testid={`channel-edit-drawer-${channel.id}`}
      >
        <form action={formAction} className="flex h-full flex-col">
          <DialogHeader className="border-border shrink-0 border-b px-6 py-4 pe-14">
            <DialogTitle className="text-title-section text-fg-primary font-semibold">
              {tr("users.channelsEdit.title", "Edit social channel")}
            </DialogTitle>
            <DialogDescription className="text-body text-fg-secondary mt-1">
              {tr(
                "users.channelsEdit.description",
                "Update how this account appears across the planner. Changes apply to new ideas immediately.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="bg-surface-subtle border-border flex items-center gap-3 rounded-[var(--radius-control)] border p-3">
              <PlatformIcon platform={channel.platform} className="h-5 w-5 shrink-0" />
              <p className="text-body text-fg-secondary">
                {channel.handle
                  ? tr(
                      "users.channelsEdit.editingLabel",
                      `Editing ${platformLabel(channel.platform)}@${channel.handle}`,
                      { platform: platformLabel(channel.platform), handle: channel.handle },
                    )
                  : tr(
                      "users.channelsEdit.editingNoHandle",
                      `Editing ${platformLabel(channel.platform)}`,
                      { platform: platformLabel(channel.platform) },
                    )}
              </p>
            </div>

            {channel.socialConnectionId ? (
              <ConnectionHealthSection
                channelId={channel.id}
                lastSyncedAt={channel.lastSyncedAt}
                lastSyncErrorCode={channel.lastSyncErrorCode}
                lastSyncErrorAt={channel.lastSyncErrorAt}
                connectionStatus={channel.connectionStatus}
                onReTest={reTest}
                reTestPending={reTestPending}
                reTestResult={reTestResult}
                {...(t !== undefined ? { t } : {})}
              />
            ) : null}

            <div className="space-y-2">
              <Label htmlFor={`edit-platform-${channel.id}`}>
                {tr("users.channelsEdit.platformLabel", "Platform")}
              </Label>
              <select
                id={`edit-platform-${channel.id}`}
                name="platform"
                defaultValue={channel.platform}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring flex h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-accountName-${channel.id}`}>
                {tr("users.channelsEdit.accountNameLabel", "Account name")}
                <span aria-hidden="true" className="text-danger ms-0.5">
                  *
                </span>
              </Label>
              <Input
                id={`edit-accountName-${channel.id}`}
                name="accountName"
                required
                defaultValue={channel.accountName}
                placeholder={tr("users.channelsEdit.accountNamePlaceholder", "Brand Instagram")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-handle-${channel.id}`}>
                {tr("users.channelsEdit.handleLabel", "Handle")}
              </Label>
              <Input
                id={`edit-handle-${channel.id}`}
                name="handle"
                defaultValue={channel.handle ?? ""}
                placeholder={tr("users.channelsEdit.handlePlaceholder", "@brand")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-url-${channel.id}`}>
                {tr("users.channelsEdit.urlLabel", "Account link")}
              </Label>
              <Input
                id={`edit-url-${channel.id}`}
                name="url"
                type="url"
                defaultValue={channel.url ?? ""}
                placeholder={tr("users.channelsEdit.urlPlaceholder", "https://…")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-accountType-${channel.id}`}>
                {tr("users.channelsEdit.ownerLabel", "Owner / contact")}
              </Label>
              <Input
                id={`edit-accountType-${channel.id}`}
                name="accountType"
                defaultValue={channel.accountType ?? ""}
                placeholder={tr("users.channelsEdit.ownerPlaceholder", "Marketing team")}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id={`edit-active-${channel.id}`}
                name="isActive"
                value="on"
                defaultChecked={channel.isActive}
              />
              <label
                htmlFor={`edit-active-${channel.id}`}
                className="text-body text-fg-primary cursor-pointer font-semibold"
              >
                {tr("users.channelsEdit.activeLabel", "Active")}
              </label>
              <span className="text-label text-fg-muted">
                {tr(
                  "users.channelsEdit.activeHint",
                  "Inactive channels are hidden from new idea targeting.",
                )}
              </span>
            </div>

            {state?.error ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {state.error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="border-border shrink-0 border-t px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tr("common.cancel", "Cancel")}
            </Button>
            <FormSubmitButton
              label={tr("users.channelsEdit.saveChanges", "Save changes")}
              pendingLabel={tr("users.channelsEdit.saving", "Saving…")}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Row actions cell for the channels table. Renders the kebab
 * (`MoreHorizontal`) trigger that opens a Radix DropdownMenu with
 * "Edit" + "Archive" items.
 *
 * - "Edit" opens a side drawer (ChannelEditDrawer) with the
 *   channel's current values pre-filled.
 * - "Archive" opens a confirm Dialog. The destructive action is
 *   bound via the same `archiveChannelAction(slug, channelId)` form
 *   action as before, so the soft-archive semantics (set
 *   `isActive=false, archivedAt, archivedBy`) are unchanged. The
 *   confirm step is the only addition.
 *
 * Co-located with ChannelEditDrawer (rather than a separate file) so
 * the channels page can stay a server component while the cell uses
 * a single client component to own all three pieces of state
 * (dropdown open, drawer open, confirm open).
 */
export function ChannelRowActions({
  slug,
  channel,
  t,
}: {
  slug: string;
  channel: Channel;
  /**
   * Optional translator. When provided, every user-visible string
   * (kebab aria-label, dropdown labels, archive-confirm dialog
   * + toast) renders from `users.channelsEdit.*`; when omitted,
   * the stored English copy is used.
   */
  t?: Translator;
}) {
  const localeT = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : localeT(key, params) || fallback;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

  const handleArchive = () => {
    startArchiveTransition(async () => {
      const result = await archiveChannelAction(slug, channel.id);
      if (result.error) {
        // OTHER-07 — the server action used to `return;` on every
        // error path (auth, missing workspace, wrong role). The
        // confirm dialog closed silently and the user had no idea
        // why. Now the action returns `{ error?: string }` and we
        // surface it in a destructive toast.
        toast.error(tr("users.channelsEdit.archiveToastErrorTitle", "Could not archive channel"), {
          description: result.error,
        });
        return;
      }
      setConfirmOpen(false);
    });
  };

  const handleText = channel.handle ? `@${channel.handle}` : channel.accountName;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={tr(
              "users.channelsEdit.rowActionsAria",
              `Open actions for ${channel.accountName}`,
              { name: channel.accountName },
            )}
            data-testid={`channel-row-actions-${channel.id}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(e: Event) => {
              e.preventDefault();
              setDrawerOpen(true);
            }}
          >
            {tr("users.channelsEdit.rowActionEdit", "Edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e: Event) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            {tr("users.channelsEdit.rowActionArchive", "Archive")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChannelEditDrawer
        slug={slug}
        channel={channel}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        {...(t !== undefined ? { t } : {})}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md" data-testid={`channel-archive-confirm-${channel.id}`}>
          <DialogHeader>
            <DialogTitle className="text-title-card text-fg-primary font-semibold">
              {tr("users.channelsEdit.archiveConfirmTitle", `Archive ${handleText}?`, {
                handle: handleText,
              })}
            </DialogTitle>
            <DialogDescription className="text-body text-fg-secondary">
              {tr(
                "users.channelsEdit.archiveConfirmBody",
                "This hides the channel from new ideas but preserves its audit history. You can re-activate it from the database if needed.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isArchiving}
            >
              {tr("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={isArchiving}
              aria-busy={isArchiving || undefined}
            >
              {isArchiving
                ? tr("users.channelsEdit.archiveConfirmPending", "Archiving…")
                : tr("users.channelsEdit.archiveConfirmLabel", "Archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Drawer-local "Connection health" section. Renders only for
 * connected channels (the parent gates on `socialConnectionId`).
 * Shows:
 *
 *   - Last sync (the most recent successful snapshot, surfaced as
 *     a relative timestamp via `formatRelativeDate`)
 *   - Last error (the most recent failure, with the humanized
 *     provider error code)
 *   - Re-test button (same action as the row-level one, so the
 *     user can validate without closing the drawer)
 *
 * Inline feedback is rendered under the button: a green "Validated
 * X ago" chip on success, a red `role="alert"` line with the
 * error message on failure. The state is owned by the parent
 * drawer so the chip survives re-renders triggered by the
 * save-changes form action.
 */
function ConnectionHealthSection({
  channelId,
  lastSyncedAt,
  lastSyncErrorCode,
  lastSyncErrorAt,
  connectionStatus,
  onReTest,
  reTestPending,
  reTestResult,
  t,
}: {
  channelId: string;
  lastSyncedAt: Date | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorAt: Date | null;
  connectionStatus: Channel["connectionStatus"];
  onReTest: () => void;
  reTestPending: boolean;
  reTestResult:
    { kind: "success"; lastSyncedAt: string } | { kind: "error"; message: string } | null;
  t?: Translator;
}) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  // Prefer the in-flight Re-test result (fresher than the row
  // prop) when present. On success, surface the result timestamp;
  // on failure, show the inline error and ignore the stale row
  // error columns (the row will be re-rendered after revalidate
  // with the new `last_sync_error_code`).
  const showError =
    reTestResult?.kind === "error"
      ? reTestResult.message
      : connectionStatus !== "connected" && lastSyncErrorCode
        ? `${humanizeErrorCode(lastSyncErrorCode, tr)}${
            lastSyncErrorAt ? ` (${formatRelativeDate(lastSyncErrorAt)})` : ""
          }`
        : null;
  const showSuccess = reTestResult?.kind === "success";
  return (
    <section
      className="border-border bg-surface-subtle space-y-3 rounded-[var(--radius-control)] border p-4"
      data-testid={`channel-health-${channelId}`}
      aria-label={tr("users.channelsHealth.sectionAria", "Connection health")}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-body text-fg-primary font-semibold">
          {tr("users.channelsHealth.title", "Connection health")}
        </h3>
        <span className="text-label text-fg-muted" aria-live="polite" data-testid="health-status">
          {connectionStatus === "connected"
            ? tr("users.channelsHealth.statusConnected", "Connected")
            : connectionStatus === "needs_reauth"
              ? tr("users.channelsHealth.statusNeedsReconnect", "Needs reconnect")
              : connectionStatus === "sync_error"
                ? tr("users.channelsHealth.statusSyncDelayed", "Sync delayed")
                : connectionStatus === "disconnected"
                  ? tr("users.channelsHealth.statusDisconnected", "Disconnected")
                  : tr("users.channelsHealth.statusManual", "Manual")}
        </span>
      </header>
      <dl className="text-label grid gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{tr("users.channelsHealth.lastSyncLabel", "Last sync")}</dt>
          <dd className="text-fg-primary font-medium">
            {lastSyncedAt
              ? formatRelativeDate(lastSyncedAt)
              : tr("users.channelsHealth.lastSyncNever", "Never")}
          </dd>
        </div>
      </dl>
      {showError ? (
        <p
          role="alert"
          className="text-label text-danger inline-flex items-center gap-1"
          data-testid="health-error"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden={true} />
          {showError}
        </p>
      ) : null}
      {showSuccess && reTestResult?.kind === "success" ? (
        <p
          className="text-label text-fg-muted inline-flex items-center gap-1"
          data-testid="health-success"
        >
          <Check className="text-success h-3 w-3" aria-hidden={true} />
          {tr(
            "users.channelsHealth.validatedAt",
            `Validated ${formatRelativeDate(new Date(reTestResult.lastSyncedAt))}`,
            { when: formatRelativeDate(new Date(reTestResult.lastSyncedAt)) },
          )}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onReTest}
        disabled={reTestPending}
        aria-busy={reTestPending}
        data-testid="health-retest-button"
      >
        <RefreshCw className="h-3 w-3" aria-hidden={true} />
        {reTestPending
          ? tr("users.channelsHealth.validating", "Validating…")
          : tr("users.channelsHealth.retestLabel", "Re-test connection")}
      </Button>
    </section>
  );
}

/**
 * Local copy map for `lastSyncErrorCode` values. Mirrors the
 * `humanizeTestError` taxonomy in `src/lib/social/sync.ts` but
 * covers the subset of codes the user is likely to see in the
 * drawer's persistent health section. Provider error codes that
 * never reach the row (e.g. `platform_kek_missing`) are omitted —
 * those are operator-only and would never appear in a user-visible
 * "last error" chip.
 */
function humanizeErrorCode(code: string, tr: (key: string, fallback: string) => string): string {
  switch (code) {
    case "auth_expired":
      return tr("users.channelsErrors.authExpired", "Meta access expired");
    case "permission_denied":
      return tr("users.channelsErrors.permissionDenied", "Missing analytics permission");
    case "rate_limited":
      return tr("users.channelsErrors.rateLimited", "Meta rate-limited this account");
    case "provider_unavailable":
      return tr("users.channelsErrors.providerUnavailable", "Meta was temporarily unavailable");
    case "not_found":
      return tr("users.channelsErrors.notFound", "Connected account not found");
    default:
      return code;
  }
}
