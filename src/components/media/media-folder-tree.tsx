"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Info,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { MediaFolderTreeRow } from "@/lib/media/service";

/**
 * Collapsible folder tree that powers the library sidebar.
 *
 * Plan §3.3 + §3.9 (2026-09-16 audit) plus the 2026-09-18 polish:
 *   - sectioned groups ("Quick filters" / "Folders" / "Shared") with
 *     visible labels so flat lists stop merging together;
 *   - one kebab per row replaces the four inline icon buttons so row
 *     height drops and the folder name has room to breathe;
 *   - independent vertical scroll (`max-h-[60vh] overscroll-contain`)
 *     so deep trees never push the grid down;
 *   - CSS-var depth indent (`var(--tree-indent)` +
 *     `(depth - 1) * var(--tree-indent-step)`) replaces ad-hoc
 *     `rem` math and stays in step with the design tokens;
 *   - sticky-footer create form so the tree stays scrollable while
 *     the user types a folder name;
 *   - Expand-all / Collapse-all controls + a name-only search field
 *     live in the header for keyboard reach.
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
    /**
     * Additional labels added in the 2026-09-18 polish — kebab row
     * actions, header controls, and section headers. Kept as a
     * separate namespace to keep the legacy surface untouched while
     * letting the parent page (which already pulls `media.tree.*`
     * keys) opt into the new strings.
     */
    polish: {
      expandAll: string;
      collapseAll: string;
      searchPlaceholder: string;
      noFoldersYet: string;
      noSearchMatch: string;
      section: { quickFilters: string; folders: string; shared: string };
      actions: {
        label: string;
        info: string;
        newSubfolder: string;
        rename: string;
        archive: string;
        archiveConfirm: string;
      };
    };
  };
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  // Module-scoped so ESLint's react-hooks/static-components rule does
  // not complain that we're constructing a component inside render.
  return (
    <h3
      aria-hidden="true"
      className="text-label text-fg-muted mt-3 mb-1 px-2 font-semibold tracking-wide uppercase"
    >
      {children}
    </h3>
  );
}

export function MediaFolderTree(props: TreeProps) {
  const router = useRouter();
  const t = useLocaleT();
  const [creating, setCreating] = React.useState<{ parentId: string | null } | null>(null);
  const [newName, setNewName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [expandedOverrides, setExpandedOverrides] = React.useState<"all" | "none" | null>(null);

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, MediaFolderTreeRow[]>();
    for (const folder of props.folders) {
      const key = folder.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), folder]);
    }
    return map;
  }, [props.folders]);

  // Pre-expand the active folder + ancestors on first paint. After
  // that, the user has full control via the chevron buttons and the
  // header's Expand-all / Collapse-all controls.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const next = new Set<string>();
    for (const ancestor of props.ancestors) next.add(ancestor.id);
    if (props.activeFolderId) next.add(props.activeFolderId);
    return next;
  });

  // Apply Expand-all / Collapse-all commands. The base `expanded`
  // set keeps the user's per-row choices; the override flips every
  // decision in one direction without losing the seed.
  const effectiveExpanded = React.useMemo(() => {
    if (expandedOverrides === "all") {
      return new Set(props.folders.map((folder) => folder.id));
    }
    if (expandedOverrides === "none") {
      return new Set<string>();
    }
    return expanded;
  }, [expanded, expandedOverrides, props.folders]);

  const expandAll = () => setExpandedOverrides("all");
  const collapseAll = () => setExpandedOverrides("none");

  // Reset the header overrides once the user toggles a single row by
  // hand — keeps their explicit micro-control ahead of the bulk
  // actions.
  const toggle = (folderId: string) => {
    setExpandedOverrides(null);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

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

  // Folder-name filter (case-insensitive). When empty, render the
  // full tree; when non-empty, hide non-matching rows but keep their
  // ancestors expanded so the user still sees the path.
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = React.useCallback(
    (folder: MediaFolderTreeRow): boolean => {
      if (!normalizedSearch) return true;
      return folder.name.toLowerCase().includes(normalizedSearch);
    },
    [normalizedSearch],
  );

  // For a folder to be visible during search, it must match OR be
  // an ancestor of a matching folder. We pre-compute that set lazily.
  const visibleFolderIds = React.useMemo(() => {
    if (!normalizedSearch) return null;
    const visible = new Set<string>();
    const stack: MediaFolderTreeRow[] = [...(byParent.get(null) ?? [])];
    while (stack.length > 0) {
      const node = stack.pop()!;
      const children = byParent.get(node.id) ?? [];
      if (matchesSearch(node)) {
        // Match found — mark the row + every ancestor up the chain.
        visible.add(node.id);
        let cursor = node.parentId;
        while (cursor) {
          visible.add(cursor);
          const next = props.folders.find((folder) => folder.id === cursor);
          if (!next) break;
          cursor = next.parentId ?? null;
        }
      } else {
        // Even non-matches that are parents of matches should be
        // visible so the user can navigate.
        for (const child of children) {
          if (visible.has(child.id)) visible.add(node.id);
        }
      }
      stack.push(...children);
    }
    return visible;
  }, [normalizedSearch, byParent, matchesSearch, props.folders]);

  const isVisible = (folder: MediaFolderTreeRow): boolean => {
    if (!visibleFolderIds) return true;
    return visibleFolderIds.has(folder.id);
  };

  const renderRow = (folder: MediaFolderTreeRow, depth: number): React.ReactNode => {
    if (!isVisible(folder)) return null;
    const isExpanded = effectiveExpanded.has(folder.id);
    const children = byParent.get(folder.id) ?? [];
    const visibleChildren = children.filter(isVisible);
    const isActive = props.activeFolderId === folder.id && !props.sharedOnly;
    const badgeLabel = props.labels[
      folder.isPostsRoot ? "postBadge" : folder.isBrandRoot ? "brandBadge" : "systemBadge"
    ] as string;
    const rowDepthStyle: React.CSSProperties = {
      paddingInlineStart: `calc(var(--tree-indent) + ${Math.max(depth - 1, 0)} * var(--tree-indent-step))`,
    };
    return (
      <li
        key={folder.id}
        role="treeitem"
        aria-expanded={visibleChildren.length > 0 ? isExpanded : undefined}
        aria-level={depth + 1}
        aria-selected={isActive}
      >
        <div
          className={cn(
            "flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] pe-1",
            isActive ? "bg-primary-subtle" : "hover:bg-surface-subtle",
          )}
          style={rowDepthStyle}
        >
          {visibleChildren.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(folder.id)}
              aria-label={
                isExpanded
                  ? t("media.tree.collapse", { name: folder.name })
                  : t("media.tree.expand", { name: folder.name })
              }
              className="text-fg-secondary hover:bg-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span aria-hidden="true" className="inline-block h-9 w-9 shrink-0" />
          )}
          <Link
            href={href(folder.id)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "text-label flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={props.labels.polish.actions.label}
                  className="h-9 w-9"
                  onClick={(event) => event.stopPropagation()}
                  data-testid="folder-row-kebab"
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => router.push(`${props.basePath}?folder=${folder.id}&audit=1`)}
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                  <span>{props.labels.polish.actions.info}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCreating({ parentId: folder.id })}>
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                  <span>{props.labels.polish.actions.newSubfolder}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
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
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  <span>{props.labels.polish.actions.rename}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
                  onSelect={async () => {
                    if (
                      !window.confirm(
                        `${props.labels.polish.actions.archiveConfirm}\n\n${folder.name}`,
                      )
                    )
                      return;
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
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>{props.labels.polish.actions.archive}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {isExpanded && visibleChildren.length > 0 ? (
          <ul role="group" className="m-0 list-none p-0">
            {visibleChildren.map((child) => renderRow(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const roots = byParent.get(null) ?? [];
  const visibleRoots = roots.filter(isVisible);
  const hasAnyFolder = roots.length > 0;
  const filteredOut = normalizedSearch.length > 0 && visibleRoots.length === 0;

  // Section heading — uppercase + tracked, matching the <AgencySwitcher>
  // visual rhythm (see agency-switcher.tsx). Module-scoped to satisfy
  // the React-hooks/static-components ESLint rule (a component
  // constructed inside render resets its state per render).
  return (
    <aside
      className="border-border bg-surface min-w-0 rounded-[var(--radius-card)] border p-3"
      data-testid="media-folder-tree"
      style={
        {
          "--tree-indent": "0.5rem",
          "--tree-indent-step": "1rem",
        } as React.CSSProperties
      }
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-label text-fg-primary font-semibold">{props.labels.tree}</h2>
          {props.canManage ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={props.labels.newFolder}
              data-testid="folder-tree-new-folder"
              onClick={() => setCreating({ parentId: null })}
              className="min-h-9"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              <span className="ms-1 hidden sm:inline">{props.labels.newFolder}</span>
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-fg-muted pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={props.labels.polish.searchPlaceholder}
            aria-label={props.labels.polish.searchPlaceholder}
            data-testid="folder-tree-search"
            dir="auto"
            className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring block min-h-9 w-full rounded-[var(--radius-control)] border px-2 ps-7 pe-7 text-sm font-normal focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            data-testid="folder-tree-expand-all"
            className="text-label text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold focus:outline-none focus-visible:ring-2"
          >
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            {props.labels.polish.expandAll}
          </button>
          <button
            type="button"
            onClick={collapseAll}
            data-testid="folder-tree-collapse-all"
            className="text-label text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold focus:outline-none focus-visible:ring-2"
          >
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            {props.labels.polish.collapseAll}
          </button>
        </div>
      </header>

      <nav
        aria-label={props.labels.tree}
        role="tree"
        data-testid="media-folder-tree-nav"
        className="mt-3 max-h-[60vh] overflow-y-auto overscroll-contain pe-1"
      >
        <SectionHeading>{props.labels.polish.section.quickFilters}</SectionHeading>
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
                "text-label flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
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
                "text-label flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
                props.activeFolderId === "unfiled"
                  ? "bg-primary-subtle text-primary"
                  : "text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              {props.labels.unfiled}
            </Link>
          </li>
        </ul>

        <SectionHeading>{props.labels.polish.section.folders}</SectionHeading>
        {hasAnyFolder ? (
          <ul role="group" className="m-0 list-none p-0">
            {visibleRoots.map((root) => renderRow(root, 1))}
          </ul>
        ) : (
          <p className="text-label text-fg-muted px-2 py-2" role="note">
            {props.labels.polish.noFoldersYet}
          </p>
        )}
        {filteredOut ? (
          <p className="text-label text-fg-muted px-2 py-2" role="note">
            {props.labels.polish.noSearchMatch}
          </p>
        ) : null}

        <SectionHeading>{props.labels.polish.section.shared}</SectionHeading>
        <ul role="group" className="m-0 list-none p-0">
          <li role="treeitem" aria-level={1} aria-selected={props.sharedOnly}>
            <Link
              href={href(null, true)}
              scroll={false}
              aria-current={props.sharedOnly ? "page" : undefined}
              className={cn(
                "text-label flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-semibold",
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

      {creating ? (
        <div className="border-border bg-surface-subtle sticky bottom-0 mt-3 rounded-[var(--radius-control)] border p-2">
          <form className="grid gap-2" onSubmit={createFolder}>
            <label className="text-label text-fg-primary font-semibold">
              {props.labels.newFolder}
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={props.labels.folderPlaceholder}
                maxLength={80}
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-9 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
              />
            </label>
            <label className="text-label text-fg-primary font-semibold">
              {props.labels.parentFolder}
              <select
                value={creating.parentId ?? ""}
                onChange={(event) => setCreating({ parentId: event.target.value || null })}
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-9 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
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
        </div>
      ) : null}
    </aside>
  );
}
