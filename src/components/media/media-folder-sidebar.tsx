"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { Archive, Folder, FolderPlus, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FolderOption = { id: string; name: string };

function FolderLinkStatus() {
  const { pending } = useLinkStatus();
  return (
    <span
      className="ms-auto inline-flex h-4 w-4 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <Loader2 className={`h-3.5 w-3.5 ${pending ? "animate-spin opacity-100" : "opacity-0"}`} />
    </span>
  );
}

export function MediaFolderSidebar({
  basePath,
  preserveParams,
  workspaceId,
  workspaceName,
  folders,
  activeFolder,
  sharedOnly,
  canManage,
  labels,
}: {
  basePath: string;
  preserveParams: Record<string, string>;
  workspaceId: string;
  workspaceName: string;
  folders: FolderOption[];
  activeFolder: string;
  sharedOnly: boolean;
  canManage: boolean;
  labels: {
    folders: string;
    allMedia: string;
    unfiled: string;
    agencyShared: string;
    newFolder: string;
    folderName: string;
    folderPlaceholder: string;
    createFolder: string;
    renameFolder: string;
    archiveFolder: string;
    archiveConfirm: string;
    folderError: string;
  };
}) {
  const router = useRouter();
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function href(folder: string, shared = false) {
    const params = new URLSearchParams(preserveParams);
    params.set("workspace", workspaceId);
    params.delete("folder");
    params.delete("shared");
    if (folder) params.set("folder", folder);
    if (shared) params.set("shared", "1");
    const query = params.toString();
    return `${basePath}?${query}`;
  }

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name: name.trim() }),
      });
      if (!response.ok) throw new Error("folder create failed");
      setName("");
      setNewFolderOpen(false);
      router.refresh();
    } catch {
      setError(labels.folderError);
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder(folder: FolderOption) {
    const nextName = window.prompt(labels.renameFolder, folder.name)?.trim();
    if (!nextName || nextName === folder.name) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/media/folders/${encodeURIComponent(folder.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      if (!response.ok) throw new Error("folder rename failed");
      router.refresh();
    } catch {
      setError(labels.folderError);
    } finally {
      setBusy(false);
    }
  }

  async function archiveFolder(folder: FolderOption) {
    if (!window.confirm(`${labels.archiveConfirm}\n\n${folder.name}`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/media/folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("folder archive failed");
      router.refresh();
    } catch {
      setError(labels.folderError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="border-border bg-surface min-w-0 rounded-[var(--radius-card)] border p-3 lg:w-56 lg:shrink-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-label text-fg-primary font-semibold">{labels.folders}</h2>
        {canManage ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={labels.newFolder}
            onClick={() => setNewFolderOpen((value) => !value)}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <p className="text-label text-fg-muted mt-1 truncate">{workspaceName}</p>
      {newFolderOpen ? (
        <form className="mt-3 grid gap-2" onSubmit={(event) => void createFolder(event)}>
          <label
            className="text-label text-fg-primary font-semibold"
            htmlFor={`new-folder-${workspaceId}`}
          >
            {labels.folderName}
            <Input
              id={`new-folder-${workspaceId}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={labels.folderPlaceholder}
              maxLength={80}
              className="mt-1"
              autoFocus
            />
          </label>
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {labels.createFolder}
          </Button>
          {error ? (
            <p className="text-label text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      <select
        className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-3 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 lg:hidden"
        value={sharedOnly ? "shared" : activeFolder || "all"}
        aria-label={labels.folders}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            value === "all" ? href("") : value === "shared" ? href("", true) : href(value),
            { scroll: false },
          );
        }}
      >
        <option value="all">{labels.allMedia}</option>
        <option value="unfiled">{labels.unfiled}</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
        <option value="shared">{labels.agencyShared}</option>
      </select>
      <nav className="mt-3 hidden gap-1 lg:grid" aria-label={labels.folders}>
        <Link
          href={href("")}
          scroll={false}
          aria-current={!activeFolder && !sharedOnly ? "page" : undefined}
          className={`text-label flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold ${!activeFolder && !sharedOnly ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle"}`}
        >
          <Folder className="h-4 w-4" aria-hidden="true" />
          {labels.allMedia}
          <FolderLinkStatus />
        </Link>
        <Link
          href={href("unfiled")}
          scroll={false}
          aria-current={activeFolder === "unfiled" ? "page" : undefined}
          className={`text-label flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold ${activeFolder === "unfiled" ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle"}`}
        >
          <Folder className="h-4 w-4" aria-hidden="true" />
          {labels.unfiled}
          <FolderLinkStatus />
        </Link>
        {folders.map((folder) => (
          <div key={folder.id} className="flex min-w-0 items-center gap-1">
            <Link
              href={href(folder.id)}
              scroll={false}
              aria-current={activeFolder === folder.id ? "page" : undefined}
              className={`text-label flex min-h-10 min-w-0 flex-1 items-center gap-2 truncate rounded-[var(--radius-control)] px-2 font-semibold ${activeFolder === folder.id ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle"}`}
            >
              <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{folder.name}</span>
              <FolderLinkStatus />
            </Link>
            {canManage ? (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${labels.renameFolder}: ${folder.name}`}
                  disabled={busy}
                  onClick={() => void renameFolder(folder)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${labels.archiveFolder}: ${folder.name}`}
                  disabled={busy}
                  onClick={() => void archiveFolder(folder)}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </>
            ) : null}
          </div>
        ))}
        <Link
          href={href("", true)}
          scroll={false}
          aria-current={sharedOnly ? "page" : undefined}
          className={`text-label flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold ${sharedOnly ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle"}`}
        >
          <Folder className="h-4 w-4" aria-hidden="true" />
          {labels.agencyShared}
          <FolderLinkStatus />
        </Link>
      </nav>
    </aside>
  );
}
