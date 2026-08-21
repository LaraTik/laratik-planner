"use client";

import * as React from "react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
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
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archiveChannelAction, updateChannelAction } from "./actions";

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
}: {
  slug: string;
  channel: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const boundAction = React.useMemo(
    () => updateChannelAction.bind(null, slug, channel.id),
    [slug, channel.id],
  );
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, {});

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
        // (rendered by DialogContent at `top-4 right-4`) lands in the
        // top-right corner, matching the Stitch header.
        className="bg-surface inset-y-0 top-0 right-0 left-auto m-0 h-screen w-screen max-w-[520px] translate-x-0 translate-y-0 overflow-hidden p-0 sm:rounded-none"
        data-testid={`channel-edit-drawer-${channel.id}`}
      >
        <form action={formAction} className="flex h-full flex-col">
          <DialogHeader className="border-border shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle className="text-title-section text-fg-primary font-semibold">
              Edit social channel
            </DialogTitle>
            <DialogDescription className="text-body text-fg-secondary mt-1">
              Update how this account appears across the planner. Changes apply to new ideas
              immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="bg-surface-subtle border-border flex items-center gap-3 rounded-[var(--radius-control)] border p-3">
              <PlatformIcon platform={channel.platform} className="h-5 w-5 shrink-0" />
              <p className="text-body text-fg-secondary">
                Editing <span className="font-semibold">{platformLabel(channel.platform)}</span>
                {channel.handle ? (
                  <>
                    {" — "}
                    <span className="text-fg-muted">@{channel.handle}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-platform-${channel.id}`}>Platform</Label>
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
                Account name
                <span aria-hidden="true" className="text-danger ml-0.5">
                  *
                </span>
              </Label>
              <Input
                id={`edit-accountName-${channel.id}`}
                name="accountName"
                required
                defaultValue={channel.accountName}
                placeholder="Brand Instagram"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-handle-${channel.id}`}>Handle</Label>
              <Input
                id={`edit-handle-${channel.id}`}
                name="handle"
                defaultValue={channel.handle ?? ""}
                placeholder="@brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-url-${channel.id}`}>Account link</Label>
              <Input
                id={`edit-url-${channel.id}`}
                name="url"
                type="url"
                defaultValue={channel.url ?? ""}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-accountType-${channel.id}`}>Owner / contact</Label>
              <Input
                id={`edit-accountType-${channel.id}`}
                name="accountType"
                defaultValue={channel.accountType ?? ""}
                placeholder="Marketing team"
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={channel.isActive}
                className="border-border text-primary focus-visible:ring-focus-ring h-4 w-4 rounded-[var(--radius-control)] border focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              />
              <span className="text-body text-fg-primary font-semibold">Active</span>
              <span className="text-label text-fg-muted">
                Inactive channels are hidden from new idea targeting.
              </span>
            </label>

            {state?.error ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {state.error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="border-border shrink-0 border-t px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <FormSubmitButton label="Save changes" pendingLabel="Saving…" />
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
export function ChannelRowActions({ slug, channel }: { slug: string; channel: Channel }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

  const handleArchive = () => {
    startArchiveTransition(async () => {
      await archiveChannelAction(slug, channel.id);
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
            aria-label={`Open actions for ${channel.accountName}`}
            data-testid={`channel-row-actions-${channel.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDrawerOpen(true);
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChannelEditDrawer
        slug={slug}
        channel={channel}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md" data-testid={`channel-archive-confirm-${channel.id}`}>
          <DialogHeader>
            <DialogTitle className="text-title-card text-fg-primary font-semibold">
              Archive {handleText}?
            </DialogTitle>
            <DialogDescription className="text-body text-fg-secondary">
              This hides the channel from new ideas but preserves its audit history. You can
              re-activate it from the database if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={isArchiving}
              aria-busy={isArchiving || undefined}
            >
              {isArchiving ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
