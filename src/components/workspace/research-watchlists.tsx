"use client";

import * as React from "react";
import { Archive, ArrowDown, ArrowUp, Copy, ListFilter, Move, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";

export type ResearchWatchlistOption = {
  id: string;
  name: string;
  description: string | null;
  shareScope: "me" | "workspace";
  accountIds: string[];
  memberPositions?: Record<string, number>;
};

export type ResearchWatchlistAccountOption = {
  id: string;
  label: string;
  handle: string;
};

type Labels = {
  title: string;
  description: string;
  addTitle: string;
  name: string;
  namePlaceholder: string;
  shareScope: string;
  privateScope: string;
  workspaceScope: string;
  create: string;
  creating: string;
  duplicate: string;
  error: string;
  accountCount: string;
  members: string;
  target: string;
  moveUp: string;
  moveDown: string;
  copy: string;
  move: string;
  archive: string;
  archiving: string;
};

export function ResearchWatchlists({
  workspaceSlug,
  canManage,
  initialWatchlists,
  accounts = [],
  labels,
}: {
  workspaceSlug: string;
  canManage: boolean;
  initialWatchlists: ResearchWatchlistOption[];
  accounts?: ResearchWatchlistAccountOption[];
  labels: Labels;
}) {
  const [watchlists, setWatchlists] = React.useState(initialWatchlists);
  const [name, setName] = React.useState("");
  const [shareScope, setShareScope] = React.useState<"me" | "workspace">("me");
  const [pending, setPending] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [targetByMember, setTargetByMember] = React.useState<Record<string, string>>({});

  function orderedMemberIds(watchlist: ResearchWatchlistOption) {
    const positions = watchlist.memberPositions ?? {};
    return [...watchlist.accountIds].sort(
      (a, b) =>
        (positions[a] ?? Number.MAX_SAFE_INTEGER) - (positions[b] ?? Number.MAX_SAFE_INTEGER),
    );
  }

  async function createWatchlist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/research/watchlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, name, shareScope }),
      });
    } catch {
      setError(labels.error);
      setPending(false);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      watchlist?: ResearchWatchlistOption;
      error?: string;
    };
    if (!response.ok || !body.watchlist) {
      setError(body.error === "duplicate" ? labels.duplicate : labels.error);
      setPending(false);
      return;
    }
    setWatchlists((current) =>
      [...current, body.watchlist!].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setName("");
    setPending(false);
  }

  async function archiveWatchlist(watchlistId: string) {
    const key = `archive:${watchlistId}`;
    setBusyAction(key);
    setError(null);
    try {
      const response = await fetch(`/api/research/watchlists/${watchlistId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug }),
      });
      if (!response.ok) {
        setError(labels.error);
        return;
      }
      setWatchlists((current) => current.filter((watchlist) => watchlist.id !== watchlistId));
    } catch {
      setError(labels.error);
    } finally {
      setBusyAction(null);
    }
  }

  async function reorderWatchlist(watchlistId: string, accountIds: string[]) {
    const previous = watchlists;
    const memberPositions = Object.fromEntries(
      accountIds.map((accountId, index) => [accountId, index]),
    );
    setWatchlists((current) =>
      current.map((watchlist) =>
        watchlist.id === watchlistId ? { ...watchlist, accountIds, memberPositions } : watchlist,
      ),
    );
    setBusyAction(`reorder:${watchlistId}`);
    setError(null);
    try {
      const response = await fetch(`/api/research/watchlists/${watchlistId}/members`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, mode: "reorder", accountIds }),
      });
      if (!response.ok) {
        setWatchlists(previous);
        setError(labels.error);
      }
    } catch {
      setWatchlists(previous);
      setError(labels.error);
    } finally {
      setBusyAction(null);
    }
  }

  async function transferMember(
    sourceWatchlistId: string,
    targetWatchlistId: string,
    accountId: string,
    mode: "copy" | "move",
  ) {
    const previous = watchlists;
    const target = watchlists.find((watchlist) => watchlist.id === targetWatchlistId);
    if (!target) return;
    setBusyAction(`${mode}:${sourceWatchlistId}:${accountId}`);
    setError(null);
    setWatchlists((current) =>
      current.map((watchlist) => {
        if (watchlist.id === sourceWatchlistId && mode === "move") {
          return {
            ...watchlist,
            accountIds: watchlist.accountIds.filter((id) => id !== accountId),
          };
        }
        if (watchlist.id === targetWatchlistId && !watchlist.accountIds.includes(accountId)) {
          const accountIds = [...watchlist.accountIds, accountId];
          return {
            ...watchlist,
            accountIds,
            memberPositions: Object.fromEntries(accountIds.map((id, index) => [id, index])),
          };
        }
        return watchlist;
      }),
    );
    try {
      const response = await fetch(`/api/research/watchlists/${sourceWatchlistId}/members`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, mode, accountId, targetWatchlistId }),
      });
      if (!response.ok) {
        setWatchlists(previous);
        setError(labels.error);
      }
    } catch {
      setWatchlists(previous);
      setError(labels.error);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="research-watchlists-title">
      <div className="flex items-start gap-3">
        <ListFilter className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <h2
            id="research-watchlists-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {labels.title}
          </h2>
          <p className="text-body text-fg-secondary mt-1">{labels.description}</p>
        </div>
      </div>

      {canManage ? (
        <Card padding="md">
          <form
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end"
            onSubmit={createWatchlist}
          >
            <FormField id="research-watchlist-name" label={labels.name} required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={labels.namePlaceholder}
                maxLength={80}
                required
              />
            </FormField>
            <FormField id="research-watchlist-scope" label={labels.shareScope}>
              <select
                value={shareScope}
                onChange={(event) => setShareScope(event.target.value as "me" | "workspace")}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="me">{labels.privateScope}</option>
                <option value="workspace">{labels.workspaceScope}</option>
              </select>
            </FormField>
            <Button type="submit" disabled={pending}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {pending ? labels.creating : labels.create}
            </Button>
          </form>
          {error ? (
            <p className="text-label text-danger mt-3" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
      ) : null}

      {watchlists.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {watchlists.map((watchlist) => {
            const memberIds = orderedMemberIds(watchlist);
            return (
              <Card key={watchlist.id} padding="md" className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-body text-fg-primary truncate font-semibold">
                      {watchlist.name}
                    </h3>
                    <p className="text-label text-fg-secondary mt-1">
                      {watchlist.description ||
                        labels.accountCount.replace("{count}", String(watchlist.accountIds.length))}
                    </p>
                  </div>
                  <span className="text-label text-fg-muted shrink-0">
                    {labels.accountCount.replace("{count}", String(watchlist.accountIds.length))}
                  </span>
                </div>

                {memberIds.length > 0 && accounts.length > 0 ? (
                  <div className="border-border border-t pt-3">
                    <h4 className="text-label text-fg-primary font-semibold">{labels.members}</h4>
                    <ol className="mt-2 grid gap-2">
                      {memberIds.map((accountId, index) => {
                        const account = accounts.find((candidate) => candidate.id === accountId);
                        const label = account?.label || account?.handle || accountId;
                        const otherLists = watchlists.filter(
                          (candidate) => candidate.id !== watchlist.id,
                        );
                        const targetId =
                          targetByMember[`${watchlist.id}:${accountId}`] || otherLists[0]?.id || "";
                        const actionKey = `${watchlist.id}:${accountId}`;
                        return (
                          <li
                            key={accountId}
                            className="border-border bg-surface-subtle grid gap-2 rounded-[var(--radius-control)] border p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-label text-fg-primary min-w-0 truncate">
                                <bdi>{label}</bdi>
                              </span>
                              <span className="flex shrink-0 gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`${labels.moveUp}: ${label}`}
                                  disabled={index === 0 || busyAction === `reorder:${watchlist.id}`}
                                  onClick={() => {
                                    const next = [...memberIds];
                                    [next[index - 1], next[index]] = [
                                      next[index]!,
                                      next[index - 1]!,
                                    ];
                                    void reorderWatchlist(watchlist.id, next);
                                  }}
                                >
                                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`${labels.moveDown}: ${label}`}
                                  disabled={
                                    index === memberIds.length - 1 ||
                                    busyAction === `reorder:${watchlist.id}`
                                  }
                                  onClick={() => {
                                    const next = [...memberIds];
                                    [next[index], next[index + 1]] = [
                                      next[index + 1]!,
                                      next[index]!,
                                    ];
                                    void reorderWatchlist(watchlist.id, next);
                                  }}
                                >
                                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </span>
                            </div>
                            {canManage && otherLists.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-label text-fg-secondary min-w-0 flex-1">
                                  <span className="sr-only">{labels.target}</span>
                                  <select
                                    aria-label={`${labels.target}: ${label}`}
                                    value={targetId}
                                    onChange={(event) =>
                                      setTargetByMember((current) => ({
                                        ...current,
                                        [`${watchlist.id}:${accountId}`]: event.target.value,
                                      }))
                                    }
                                    className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-2 py-2 focus-visible:ring-2 focus-visible:outline-none"
                                  >
                                    {otherLists.map((candidate) => (
                                      <option key={candidate.id} value={candidate.id}>
                                        {candidate.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!targetId || busyAction === `copy:${actionKey}`}
                                  onClick={() =>
                                    void transferMember(watchlist.id, targetId, accountId, "copy")
                                  }
                                >
                                  <Copy className="h-4 w-4" aria-hidden="true" />
                                  {labels.copy}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!targetId || busyAction === `move:${actionKey}`}
                                  onClick={() =>
                                    void transferMember(watchlist.id, targetId, accountId, "move")
                                  }
                                >
                                  <Move className="h-4 w-4" aria-hidden="true" />
                                  {labels.move}
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : null}

                {canManage ? (
                  <div className="border-border flex justify-end border-t pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyAction === `archive:${watchlist.id}`}
                      onClick={() => void archiveWatchlist(watchlist.id)}
                    >
                      <Archive className="h-4 w-4" aria-hidden="true" />
                      {busyAction === `archive:${watchlist.id}` ? labels.archiving : labels.archive}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card variant="dashed" padding="md">
          <p className="text-body text-fg-secondary">{labels.addTitle}</p>
        </Card>
      )}
    </section>
  );
}
