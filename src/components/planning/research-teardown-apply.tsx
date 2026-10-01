"use client";

import * as React from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyResearchTeardownAction } from "@/app/(app)/app/w/[slug]/planning/actions";

export function ResearchTeardownApply({
  workspaceSlug,
  contentItemId,
  researchTeardownId,
  editable,
  labels,
}: {
  workspaceSlug: string;
  contentItemId: string;
  researchTeardownId: string;
  editable: boolean;
  labels: {
    title: string;
    description: string;
    apply: string;
    applying: string;
    applied: string;
    nothingToApply: string;
    error: string;
  };
}) {
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  function apply() {
    if (!editable || pending) return;
    setMessage(null);
    setError(false);
    startTransition(async () => {
      const result = await applyResearchTeardownAction({
        workspaceSlug,
        contentItemId,
        researchTeardownId,
      });
      if (!result.ok) {
        setError(true);
        setMessage(labels.error);
        return;
      }
      setMessage(
        result.appliedFields && result.appliedFields.length > 0
          ? labels.applied
          : labels.nothingToApply,
      );
    });
  }

  return (
    <aside
      className="border-primary/25 bg-primary-subtle/30 text-fg-secondary flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
      data-testid="research-teardown-apply"
    >
      <div>
        <p className="text-body text-fg-primary font-semibold">{labels.title}</p>
        <p className="text-label mt-1">{labels.description}</p>
        {message ? (
          <p className={error ? "text-label text-danger mt-1" : "text-label text-success mt-1"}>
            {error ? null : <Check className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />}
            {message}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!editable || pending}
        onClick={apply}
        aria-busy={pending || undefined}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {pending ? labels.applying : labels.apply}
      </Button>
    </aside>
  );
}
