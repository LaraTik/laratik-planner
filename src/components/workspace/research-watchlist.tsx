"use client";

import * as React from "react";
import { ArrowUpRight, Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ResearchWatchlistOption } from "@/components/workspace/research-watchlists";

type WatchlistAccount = {
  id: string;
  platform: "instagram" | "facebook" | "tiktok" | "youtube";
  handle: string;
  displayName: string | null;
  sourceUrl: string;
  providerStatus: "manual" | "available" | "unsupported" | "error";
};

type Labels = {
  title: string;
  description: string;
  addTitle: string;
  platform: string;
  handle: string;
  displayName: string;
  sourceUrl: string;
  add: string;
  sourceOnly: string;
  providerAvailable: string;
  providerUnsupported: string;
  providerError: string;
  remove: string;
  error: string;
  invalid: string;
  duplicate: string;
  membership: string;
  membershipDescription: string;
  membershipError: string;
};

const platformOptions = ["instagram", "facebook", "tiktok", "youtube"] as const;

export function ResearchWatchlist({
  workspaceSlug,
  initialAccounts,
  watchlists,
  canManage,
  labels,
}: {
  workspaceSlug: string;
  initialAccounts: WatchlistAccount[];
  watchlists: ResearchWatchlistOption[];
  canManage: boolean;
  labels: Labels;
}) {
  const [accounts, setAccounts] = React.useState(initialAccounts);
  const [platform, setPlatform] = React.useState<(typeof platformOptions)[number]>("instagram");
  const [handle, setHandle] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [memberships, setMemberships] = React.useState<Record<string, string[]>>(() =>
    Object.fromEntries(watchlists.map((watchlist) => [watchlist.id, watchlist.accountIds])),
  );
  const [membershipPending, setMembershipPending] = React.useState<string | null>(null);

  function isMember(accountId: string, watchlistId: string) {
    return memberships[watchlistId]?.includes(accountId) ?? false;
  }

  async function toggleMembership(accountId: string, watchlistId: string, checked: boolean) {
    const key = `${accountId}:${watchlistId}`;
    const previous = memberships[watchlistId] ?? [];
    const next = checked
      ? previous.includes(accountId)
        ? previous
        : [...previous, accountId]
      : previous.filter((id) => id !== accountId);
    setMembershipPending(key);
    setError(null);
    setMemberships((current) => ({ ...current, [watchlistId]: next }));
    let response: Response;
    try {
      response = await fetch(`/api/research/watchlists/${watchlistId}/members`, {
        method: checked ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, accountId }),
      });
    } catch {
      setError(labels.membershipError);
      setMemberships((current) => ({ ...current, [watchlistId]: previous }));
      setMembershipPending(null);
      return;
    }
    if (!response.ok) {
      setError(labels.membershipError);
      setMemberships((current) => ({ ...current, [watchlistId]: previous }));
      setMembershipPending(null);
      return;
    }
    setMembershipPending(null);
  }

  async function addAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/research/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceSlug,
          platform,
          handle,
          displayName: displayName || undefined,
          sourceUrl,
        }),
      });
    } catch {
      setError(labels.error);
      setPending(false);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      account?: WatchlistAccount;
      error?: string;
    };
    if (!response.ok || !body.account) {
      setError(body.error === "already_exists" ? labels.duplicate : labels.invalid);
      setPending(false);
      return;
    }
    setAccounts((current) => [body.account!, ...current]);
    setHandle("");
    setDisplayName("");
    setSourceUrl("");
    setPending(false);
  }

  async function removeAccount(id: string) {
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/research/watchlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, id }),
      });
    } catch {
      setError(labels.error);
      return;
    }
    if (!response.ok) {
      setError(labels.error);
      return;
    }
    setAccounts((current) => current.filter((account) => account.id !== id));
  }

  return (
    <section className="space-y-4" aria-labelledby="research-watchlist-title">
      <div className="flex items-start gap-3">
        <UsersRound className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <h2
            id="research-watchlist-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {labels.title}
          </h2>
          <p className="text-body text-fg-secondary mt-1">{labels.description}</p>
        </div>
      </div>

      {canManage ? (
        <Card padding="md">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={addAccount}>
            <div className="text-label text-fg-primary font-semibold md:col-span-2 xl:col-span-5">
              {labels.addTitle}
            </div>
            <FormField id="research-watchlist-platform" label={labels.platform} required>
              <select
                value={platform}
                onChange={(event) =>
                  setPlatform(event.target.value as (typeof platformOptions)[number])
                }
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                {platformOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="research-watchlist-handle" label={labels.handle} required>
              <Input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="@account"
              />
            </FormField>
            <FormField id="research-watchlist-display-name" label={labels.displayName}>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </FormField>
            <FormField id="research-watchlist-source-url" label={labels.sourceUrl} required>
              <Input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </FormField>
            <div className="flex items-end">
              <Button type="submit" disabled={pending} className="w-full">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {labels.add}
              </Button>
            </div>
          </form>
          {error ? (
            <p className="text-label text-danger mt-3" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
      ) : null}

      {accounts.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} padding="md" className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-label text-fg-muted capitalize">{account.platform}</p>
                  <p className="text-body text-fg-primary truncate font-semibold">
                    {account.displayName || `@${account.handle}`}
                  </p>
                  <p className="text-label text-fg-secondary truncate">@{account.handle}</p>
                  <p className="text-label text-fg-muted mt-2">
                    {account.providerStatus === "available"
                      ? labels.providerAvailable
                      : account.providerStatus === "unsupported"
                        ? labels.providerUnsupported
                        : account.providerStatus === "error"
                          ? labels.providerError
                          : labels.sourceOnly}
                  </p>
                  <a
                    href={account.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-label text-primary mt-2 inline-flex items-center gap-1 font-semibold"
                  >
                    {account.sourceUrl}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${labels.remove}: @${account.handle}`}
                    onClick={() => void removeAccount(account.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              {watchlists.length > 0 ? (
                <fieldset className="border-border border-t pt-3">
                  <legend className="text-label text-fg-primary font-semibold">
                    {labels.membership}
                  </legend>
                  <p className="text-label text-fg-muted mt-1">{labels.membershipDescription}</p>
                  <div className="mt-2 grid gap-1">
                    {watchlists.map((watchlist) => {
                      const key = `${account.id}:${watchlist.id}`;
                      const inputId = `research-membership-${account.id}-${watchlist.id}`;
                      return (
                        <label
                          key={watchlist.id}
                          htmlFor={inputId}
                          className="text-label text-fg-secondary flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-1"
                        >
                          <Checkbox
                            id={inputId}
                            checked={isMember(account.id, watchlist.id)}
                            disabled={!canManage || membershipPending === key}
                            onCheckedChange={(checked) =>
                              void toggleMembership(account.id, watchlist.id, checked === true)
                            }
                          />
                          <span className="truncate">{watchlist.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="dashed" padding="md">
          <p className="text-body text-fg-secondary">{labels.description}</p>
        </Card>
      )}
    </section>
  );
}
