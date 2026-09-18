"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaAgencyWorkspaceSwitcher } from "./media-agency-workspace-switcher";
import { MediaUploadDialog } from "./media-upload-dialog";

/**
 * Client-only interactive header actions for the agency Media page.
 *
 * Splits the page (which is a server component because it streams the
 * asset list) from the two interactive affordances on the header:
 *
 *   1. The agency workspace switcher popover.
 *   2. The "Add media" button that opens a `<MediaUploadDialog>`.
 *
 * The dialog trigger lives here because we need local `useState` to
 * track its open state; the dialog itself mounts lazily only when
 * `open` is `true`, so it cannot bake a click handler into the
 * server-rendered body without serializing every prop through the
 * RSC payload.
 */
export function MediaLibraryActions({
  mode,
  canUpload,
  workspace,
  agencyWorkspaces,
  basePath,
  preserveParams,
  workspaceOptions,
  folderOptionsByWorkspace,
  initialSource,
}: {
  mode: "agency" | "workspace";
  canUpload: boolean;
  workspace: { id: string; name: string; slug: string } | null;
  agencyWorkspaces: { id: string; name: string; slug: string }[];
  basePath: string;
  preserveParams: Record<string, string>;
  workspaceOptions: { id: string; name: string }[];
  folderOptionsByWorkspace: Record<
    string,
    { id: string; name: string; parentId?: string | null }[]
  >;
  initialSource?: "device" | "link";
}) {
  const t = useLocaleT();
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const showWorkspaceSwitcher = mode === "agency" && agencyWorkspaces.length >= 2;

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      {showWorkspaceSwitcher ? (
        <MediaAgencyWorkspaceSwitcher
          active={null}
          options={agencyWorkspaces}
          basePath={basePath}
          preserveParams={preserveParams}
          t={(key, params) => (params ? t(key, params) : t(key))}
        />
      ) : null}
      {canUpload && mode !== "agency" ? (
        <span
          aria-hidden="true"
          data-testid="media-library-actions-workspace-label"
          className="border-border bg-surface-subtle text-fg-primary inline-flex max-w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-semibold"
        >
          <span className="truncate">{workspace?.name ?? "—"}</span>
        </span>
      ) : null}
      {canUpload ? (
        <Button
          type="button"
          onClick={() => setUploadOpen(true)}
          aria-label={t("media.uploadDialog.openAria")}
          data-testid="media-upload-trigger"
          className="min-h-11"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("media.uploadDialog.openLabel")}
        </Button>
      ) : null}
      {canUpload ? (
        <MediaUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          workspaceOptions={workspaceOptions}
          folderOptionsByWorkspace={folderOptionsByWorkspace}
          initialSource={initialSource ?? "device"}
        />
      ) : null}
    </div>
  );
}
