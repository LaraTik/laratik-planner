"use client";

import * as React from "react";
import { ListFilter, Plus } from "lucide-react";
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
};

export function ResearchWatchlists({
  workspaceSlug,
  canManage,
  initialWatchlists,
  labels,
}: {
  workspaceSlug: string;
  canManage: boolean;
  initialWatchlists: ResearchWatchlistOption[];
  labels: Labels;
}) {
  const [watchlists, setWatchlists] = React.useState(initialWatchlists);
  const [name, setName] = React.useState("");
  const [shareScope, setShareScope] = React.useState<"me" | "workspace">("me");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
          {watchlists.map((watchlist) => (
            <Card key={watchlist.id} padding="md">
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
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="dashed" padding="md">
          <p className="text-body text-fg-secondary">{labels.addTitle}</p>
        </Card>
      )}
    </section>
  );
}
