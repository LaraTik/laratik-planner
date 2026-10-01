"use client";

import * as React from "react";
import type { ResearchCollectionOption } from "@/components/workspace/research-collections";

export function ResearchCollectionPicker({
  workspaceSlug,
  itemKind,
  itemId,
  initialCollectionId,
  collections,
  label,
  noCollection,
  errorLabel,
}: {
  workspaceSlug: string;
  itemKind: "bookmark" | "teardown";
  itemId: string;
  initialCollectionId: string | null;
  collections: ResearchCollectionOption[];
  label: string;
  noCollection: string;
  errorLabel: string;
}) {
  const [collectionId, setCollectionId] = React.useState(initialCollectionId ?? "");
  const [error, setError] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function updateCollection(nextCollectionId: string) {
    if (pending) return;
    const previous = collectionId;
    setCollectionId(nextCollectionId);
    setError(false);
    setPending(true);
    const response = nextCollectionId
      ? await fetch("/api/research/collections/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceSlug,
            collectionId: nextCollectionId,
            itemKind,
            itemId,
          }),
        })
      : await fetch("/api/research/collections/items", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceSlug,
            collectionId: previous,
            itemKind,
            itemId,
          }),
        });
    if (!response.ok) {
      setCollectionId(previous);
      setError(true);
    }
    setPending(false);
  }

  return (
    <label className="text-label text-fg-secondary inline-flex items-center gap-2">
      <span>{label}</span>
      <select
        value={collectionId}
        disabled={pending || collections.length === 0}
        onChange={(event) => void updateCollection(event.target.value)}
        className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring h-9 max-w-48 rounded-[var(--radius-control)] border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        <option value="">{noCollection}</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-danger" role="status">
          {errorLabel}
        </span>
      ) : null}
    </label>
  );
}
