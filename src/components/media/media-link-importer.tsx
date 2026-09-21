"use client";

import * as React from "react";
import { Link as LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaLinkFolderBrowse } from "./media-link-folder-browse";
import type { MediaFolderListing } from "@/lib/media/folder-sources/types";

/**
 * "From link" intake. Three top-level branches:
 *
 *   1. idle / checking / ready / importing / connection / error — the
 *      existing single-file flow (unchanged).
 *
 *   2. folder — a Google Drive folder URL was pasted; the wizard
 *      transitions to `MediaLinkFolderBrowse` for the multi-file flow.
 *
 * The discriminator is the URL shape: any URL that matches the
 * `/drive/folders/<id>` family routes to the folder endpoint; everything
 * else keeps the existing single-file contract.
 */

const FOLDER_URL_PATTERN =
  /^https:\/\/drive\.google\.com\/(drive\/folders\/[A-Za-z0-9_-]+|drive\/u\/\d+\/folders\/[A-Za-z0-9_-]+)\b/;

function looksLikeFolderUrl(url: string): boolean {
  try {
    return FOLDER_URL_PATTERN.test(url.trim());
  } catch {
    return false;
  }
}

export function MediaLinkImporter({
  workspaceOptions,
  contentItemId,
}: {
  workspaceOptions: { id: string; name: string }[];
  contentItemId?: string;
}) {
  const t = useLocaleT();
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [workspaceId, setWorkspaceId] = React.useState(workspaceOptions[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [state, setState] = React.useState<
    "idle" | "checking" | "ready" | "connection" | "importing" | "error" | "folder"
  >("idle");
  const [provider, setProvider] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [folder, setFolder] = React.useState<MediaFolderListing | null>(null);

  async function checkLink() {
    setState("checking");
    setErrorCode(null);
    setFolder(null);
    if (looksLikeFolderUrl(url)) {
      try {
        const response = await fetch("/api/media/import/folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "inspect",
            url,
            workspaceId,
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          folder?: MediaFolderListing;
          error?: string;
          code?: string;
        } | null;
        if (!response.ok || !result?.folder) {
          setErrorCode(result?.code ?? "fetch_failed");
          setState("error");
          return;
        }
        setFolder(result.folder);
        setState("folder");
      } catch {
        setErrorCode("fetch_failed");
        setState("error");
      }
      return;
    }

    try {
      const response = await fetch("/api/media/import/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json().catch(() => null)) as {
        provider?: string;
        requiresConnection?: boolean;
        code?: string;
        error?: string;
      } | null;
      if (result?.code === "provider_connection_required") {
        setProvider(result.provider ?? null);
        setState("connection");
        return;
      }
      if (!response.ok || !result?.provider) {
        setErrorCode(result?.code ?? result?.error ?? "invalid_url");
        setState("error");
        return;
      }
      setProvider(result.provider);
      setState(result.requiresConnection === true ? "connection" : "ready");
    } catch {
      setErrorCode("fetch_failed");
      setState("error");
    }
  }

  async function importLink() {
    setState("importing");
    setErrorCode(null);
    try {
      const response = await fetch("/api/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          url,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(contentItemId ? { contentItemId } : {}),
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { code?: string } | null;
        if (result?.code === "provider_connection_required") {
          setState("connection");
          return;
        }
        setErrorCode(result?.code ?? "fetch_failed");
        throw new Error("import failed");
      }
      setState("idle");
      setErrorCode(null);
      setUrl("");
      setTitle("");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  const resetToLink = React.useCallback(() => {
    setState("idle");
    setFolder(null);
    setErrorCode(null);
    setTitle("");
  }, []);

  return (
    <>
      {state === "folder" && folder && workspaceId ? (
        <MediaLinkFolderBrowse
          folder={folder}
          workspaceId={workspaceId}
          onClose={resetToLink}
          onAssetReady={() => {
            router.refresh();
          }}
        />
      ) : null}
      {state !== "folder" ? (
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <LinkIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>{t("media.linkImport")}</CardTitle>
              <CardDescription>{t("media.linkPlaceholder")}</CardDescription>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setState("idle");
                  setErrorCode(null);
                }}
                placeholder={t("media.linkPlaceholder")}
                aria-label={t("media.linkImport")}
                className="mt-0 min-h-11"
              />
              <Button
                type="button"
                size="lg"
                disabled={!url.trim() || state === "checking" || state === "importing"}
                onClick={() => void checkLink()}
              >
                {state === "checking" ? t("media.checkingLink") : t("media.checkLink")}
              </Button>
            </div>
            {workspaceOptions.length > 1 ? (
              <label
                className="text-body text-fg-primary font-semibold"
                htmlFor="media-link-workspace"
              >
                {t("media.workspace")}
                <select
                  id="media-link-workspace"
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2 sm:max-w-sm"
                >
                  {workspaceOptions.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {state === "ready" || state === "importing" ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("media.titlePlaceholder")}
                  aria-label={t("media.titleLabel")}
                  className="mt-0 min-h-11"
                />
                <Button
                  type="button"
                  size="lg"
                  disabled={state === "importing" || !workspaceId}
                  onClick={() => void importLink()}
                >
                  {state === "importing" ? t("media.importing") : t("media.importLink")}
                </Button>
              </div>
            ) : null}
          </div>
          {state === "connection" ? (
            <p className="text-label text-warning mt-3" role="status">
              {t("media.linkNeedsConnection", { provider: providerLabel(provider, t) })}
            </p>
          ) : state === "ready" ? (
            <p className="text-label text-success mt-3" role="status">
              {t("media.linkReadyToCheck", { provider: providerLabel(provider, t) })}
            </p>
          ) : state === "error" ? (
            <p className="text-label text-danger mt-3" role="alert">
              {linkErrorMessage(errorCode, t)}
            </p>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function providerLabel(
  provider: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (provider === "google_drive") return t("media.googleDrive");
  if (provider === "onedrive") return t("media.oneDrive");
  return t("media.directLink");
}

function linkErrorMessage(
  code: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (code) {
    case "invalid_url":
      return t("media.linkInvalidUrl");
    case "unsafe_host":
      return t("media.linkUnsafeHost");
    case "unsupported_type":
      return t("media.linkUnsupported");
    case "missing_length":
      return t("media.linkMissingLength");
    case "too_large":
      return t("media.linkTooLarge");
    case "fetch_failed":
      return t("media.linkFetchFailed");
    case "folderInvalidUrl":
      return t("media.folderInvalidUrl");
    case "folderNotFound":
      return t("media.folderNotFound");
    case "folderNeedsConnection":
      return t("media.folderNeedsConnection");
    case "folderTooLarge":
      return t("media.folderTooLarge");
    case "folderUnsupported":
      return t("media.folderUnsupported");
    default:
      return t("media.linkError");
  }
}
