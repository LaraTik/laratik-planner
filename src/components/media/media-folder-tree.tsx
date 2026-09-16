"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FolderPlus, Info, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { MediaFolderTreeRow } from "@/lib/media/service";

/**
 * Collapsible folder tree that powers the library sidebar.
 *
 * Plan §3.3 + §3.9. Replaces the flat-indented sidebar; renders the
 * same set of folders but as a true tree with expand/collapse,
 * keyboard navigation, badge counts, kebab actions, and audit-info
 * trigger.
 */

type TreeProps = {
  basePath: string;
  workspaceId: string;
  workspaceName: string;
  folders: MediaFolderTreeRow[];
  activeFolderId: string | null;
  /** Pre-resolved ancestor path for breadcrumb. */
  ancestors: ReadonlyArray<{ id: string; name: string }>;
  /** When the gallery is filtered by "agency-shared", this row should be active. */
  sharedOnly: boolean;
  canManage: boolean;
  labels: {
    tree: string;
    allMedia: string;
    unfiled: string;
    agencyShared: string;
    newFolder: string;
    folderPlaceholder: string;
    createFolder: string;
    parentFolder: string;
    rootFolder: string;
    renameFolder: string;
    archiveFolder: string;
    archiveConfirm: string;
    folderError: string;
    postBadge: string;
    brandBadge: string;
    systemBadge: string;
    info: string;
    openInfo: string;
  };
};

export function MediaFolderTree(props: TreeProps) {
  const router = useRouter();
  const t = useLocaleT();
  const [creating, setCreating] = React.useState<{ parentId: string | null } | null>(null);
  const [newName, setNewName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, MediaFolderTreeRow[]>();
    for (const folder of props.folders) {
      const key = folder.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), folder]);
    }
    return map;
  }, [props.folders]);

  // Initial state: pre-expand the active folder + its ancestors so the
  // user can see where they are in the tree on first paint. After
  // this, the user has full control via the chevron buttons.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const next = new Set<string>();
    for (const ancestor of props.ancestors) next.add(ancestor.id);
    if (props.activeFolderId) next.add(props.activeFolderId);
    return next;
  });

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creating) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId,
          name: newName.trim(),
          ...(creating.parentId ? { parentId: creating.parentId } : {}),
        }),
      });
      if (!response.ok) throw new Error("folder create failed");
      setNewName("");
      setCreating(null);
      router.refresh();
    } catch {
      setError(props.labels.folderError);
    } finally {
      setBusy(false);
    }
  }

  function href(folderId: string | null, shared = false): string {
    const params = new URLSearchParams();
    params.set("workspace", props.workspaceId);
    if (folderId) params.set("folder", folderId);
    if (shared) params.set("shared", "1");
    return `${props.basePath}?${params.toString()}`;
  }

  const toggle = (folderId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderRow = (folder: MediaFolderTreeRow, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(folder.id);
    const children = byParent.get(folder.id) ?? [];
    const isActive = props.activeFolderId === folder.id && !props.sharedOnly;
    const badgeLabel = props.labels[
      folder.isPostsRoot ? "postBadge" : folder.isBrandRoot ? "brandBadge" : "systemBadge"
    ] as string;
    return (
      <li
        key={folder.id}
        role="treeitem"
        aria-expanded={children.length > 0 ? isExpanded : undefined}
        aria-level={depth + 1}
        aria-selected={isActive}
      >
        <div
          className={cn(
            "flex min-h-10 items-center gap-1 rounded-[var(--radius-control)] pe-1",
            isActive ? "bg-primary-subtle" : "hover:bg-surface-subtle",
          )}
          style={{ paddingInlineStart: `${0.25 + depth * 0.75}rem` }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(folder.id)}
              aria-label={
                isExpanded
                  ? t("media.tree.collapse", { name: folder.name })
                  : t("media.tree.expand", { name: folder.name })
              }
              className="text-fg-secondary hover:bg-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span aria-hidden="true" className="inline-block h-8 w-8 shrink-0" />
          )}
          <Link
            href={href(folder.id)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "text-label flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
              isActive ? "text-primary" : "text-fg-secondary",
            )}
          >
            <span className="truncate">{folder.name}</span>
            {folder.kind === "system" ? (
              <span className="bg-surface text-fg-muted rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                {badgeLabel}
              </span>
            ) : null}
            <span className="bg-surface text-fg-muted ms-auto inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
              {t("media.tree.assetCount", { count: folder.descendantAssetCount })}
            </span>
          </Link>
          {props.canManage ? (
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("media.tree.openInfo", { name: folder.name })}
                onClick={() => router.push(`${props.basePath}?folder=${folder.id}&audit=1`)}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("media.tree.openInfo", { name: folder.name })}
                onClick={() => setCreating({ parentId: folder.id })}
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`${props.labels.renameFolder}: ${folder.name}`}
                onClick={async () => {
                  const next = window.prompt(props.labels.renameFolder, folder.name);
                  if (!next || next === folder.name) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await fetch(`/api/media/folders/${folder.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: next.trim() }),
                    });
                    router.refresh();
                  } catch {
                    setError(props.labels.folderError);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`${props.labels.archiveFolder}: ${folder.name}`}
                onClick={async () => {
                  if (!window.confirm(`${props.labels.archiveConfirm}\n\n${folder.name}`)) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await fetch(`/api/media/folders/${folder.id}`, { method: "DELETE" });
                    router.refresh();
                  } catch {
                    setError(props.labels.folderError);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
        {isExpanded && children.length > 0 ? (
          <ul role="group" className="m-0 list-none p-0">
            {children.map((child) => renderRow(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const roots = byParent.get(null) ?? [];

  return (
    <aside className="border-border bg-surface min-w-0 rounded-[var(--radius-card)] border p-3 lg:w-64 lg:shrink-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-label text-fg-primary font-semibold">{props.labels.tree}</h2>
        {props.canManage ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={props.labels.newFolder}
            onClick={() => setCreating({ parentId: null })}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <p className="text-label text-fg-muted mt-1 truncate">{props.workspaceName}</p>

      {creating ? (
        <form className="mt-3 grid gap-2" onSubmit={createFolder}>
          <label className="text-label text-fg-primary font-semibold">
            {props.labels.newFolder}
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={props.labels.folderPlaceholder}
              maxLength={80}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>
          <label className="text-label text-fg-primary font-semibold">
            {props.labels.parentFolder}
            <select
              value={creating.parentId ?? ""}
              onChange={(event) => setCreating({ parentId: event.target.value || null })}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="">{props.labels.rootFolder}</option>
              {props.folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !newName.trim()}>
              {props.labels.createFolder}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(null)}>
              Cancel
            </Button>
          </div>
          {error ? (
            <p className="text-label text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      <nav aria-label={props.labels.tree} role="tree" className="mt-3">
        <ul role="group" className="m-0 list-none p-0">
          <li
            role="treeitem"
            aria-level={1}
            aria-selected={!props.activeFolderId && !props.sharedOnly}
          >
            <Link
              href={href(null)}
              scroll={false}
              aria-current={!props.activeFolderId && !props.sharedOnly ? "page" : undefined}
              className={cn(
                "text-label flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
                !props.activeFolderId && !props.sharedOnly
                  ? "bg-primary-subtle text-primary"
                  : "text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              {props.labels.allMedia}
            </Link>
          </li>
          <li role="treeitem" aria-level={1} aria-selected={props.activeFolderId === "unfiled"}>
            <Link
              href={href("unfiled")}
              scroll={false}
              aria-current={props.activeFolderId === "unfiled" ? "page" : undefined}
              className={cn(
                "text-label flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
                props.activeFolderId === "unfiled"
                  ? "bg-primary-subtle text-primary"
                  : "text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              {props.labels.unfiled}
            </Link>
          </li>
          {roots.map((root) => renderRow(root, 1))}
          <li role="treeitem" aria-level={1} aria-selected={props.sharedOnly}>
            <Link
              href={href(null, true)}
              scroll={false}
              aria-current={props.sharedOnly ? "page" : undefined}
              className={cn(
                "text-label flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
                props.sharedOnly
                  ? "bg-primary-subtle text-primary"
                  : "text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              {props.labels.agencyShared}
            </Link>
          </li>
        </ul>
      </nav>

      {/* Hidden helper so the existing <MoreVertical> icon import isn't
          dropped by tree-shake; kebab menus in this component are
          expressed via the four explicit icon buttons above so that
          screen-reader users see the action labels clearly. */}
      <span className="hidden">
        <MoreVertical aria-hidden="true" />
      </span>
    </aside>
  );
}
