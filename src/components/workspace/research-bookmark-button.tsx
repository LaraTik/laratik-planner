"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ResearchBookmarkButton({
  workspaceSlug,
  observationId,
  initialSaved,
  saveLabel,
  savedLabel,
  errorLabel,
}: {
  workspaceSlug: string;
  observationId: string;
  initialSaved: boolean;
  saveLabel: string;
  savedLabel: string;
  errorLabel: string;
}) {
  const [saved, setSaved] = React.useState(initialSaved);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);

  function toggle() {
    setError(false);
    startTransition(async () => {
      const response = await fetch("/api/research/bookmarks", {
        method: saved ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, observationId }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setSaved(!saved);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={saved}
        aria-label={saved ? savedLabel : saveLabel}
        disabled={pending}
        onClick={toggle}
        data-testid={`research-bookmark-${observationId}`}
      >
        {saved ? (
          <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Bookmark className="h-4 w-4" aria-hidden="true" />
        )}
        {saved ? savedLabel : saveLabel}
      </Button>
      {error ? (
        <span className="text-label text-danger" role="status">
          {errorLabel}
        </span>
      ) : null}
    </span>
  );
}
