"use client";

import * as React from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type ResearchCollectionOption = {
  id: string;
  name: string;
  description: string | null;
  shareScope: "me" | "workspace";
  createdBy: string;
};

type Labels = {
  title: string;
  description: string;
  name: string;
  namePlaceholder: string;
  shareScope: string;
  privateScope: string;
  workspaceScope: string;
  create: string;
  creating: string;
  duplicate: string;
  error: string;
};

export function ResearchCollections({
  workspaceSlug,
  canManage,
  initialCollections,
  labels,
}: {
  workspaceSlug: string;
  canManage: boolean;
  initialCollections: ResearchCollectionOption[];
  labels: Labels;
}) {
  const [collections, setCollections] = React.useState(initialCollections);
  const [name, setName] = React.useState("");
  const [shareScope, setShareScope] = React.useState<"me" | "workspace">("me");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/research/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceSlug, name, shareScope }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      collection?: ResearchCollectionOption;
      error?: string;
    };
    if (!response.ok || !body.collection) {
      setError(body.error === "duplicate" ? labels.duplicate : labels.error);
      setPending(false);
      return;
    }
    setCollections((current) =>
      [...current, body.collection!].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setName("");
    setPending(false);
  }

  return (
    <section className="space-y-4" aria-labelledby="research-collections-title">
      <div className="flex items-start gap-3">
        <FolderPlus className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <h2
            id="research-collections-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {labels.title}
          </h2>
          <p className="text-body text-fg-secondary mt-1">{labels.description}</p>
        </div>
      </div>

      {canManage ? (
        <Card padding="md">
          <form className="flex flex-wrap items-end gap-3" onSubmit={createCollection}>
            <div className="min-w-52 flex-1">
              <label
                htmlFor="research-collection-name"
                className="text-label text-fg-primary mb-1 block font-semibold"
              >
                {labels.name}
              </label>
              <Input
                id="research-collection-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={labels.namePlaceholder}
                maxLength={80}
                required
              />
            </div>
            <div>
              <label
                htmlFor="research-collection-scope"
                className="text-label text-fg-primary mb-1 block font-semibold"
              >
                {labels.shareScope}
              </label>
              <select
                id="research-collection-scope"
                value={shareScope}
                onChange={(event) => setShareScope(event.target.value as "me" | "workspace")}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="me">{labels.privateScope}</option>
                <option value="workspace">{labels.workspaceScope}</option>
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
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

      {collections.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={labels.title}>
          {collections.map((collection) => (
            <span
              key={collection.id}
              className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center rounded-full border px-3 py-1 font-semibold"
            >
              {collection.name}
              <span className="text-fg-muted ms-1">
                · {collection.shareScope === "me" ? labels.privateScope : labels.workspaceScope}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
