"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardCheck, Save, Sparkles } from "lucide-react";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ResearchTeardown } from "@/lib/research/teardown";
import { ResearchCollectionPicker } from "@/components/workspace/research-collection-picker";
import type { ResearchCollectionOption } from "@/components/workspace/research-collections";

type Labels = {
  title: string;
  description: string;
  sourceLabel: string;
  sourcePlaceholder: string;
  run: string;
  running: string;
  previewOnly: string;
  hook: string;
  promise: string;
  format: string;
  pacing: string;
  callToAction: string;
  beats: string;
  evidence: string;
  uncertainty: string;
  unavailable: string;
  error: string;
  notesRequired: string;
  save: string;
  saving: string;
  saved: string;
  savedTitle: string;
  savedDescription: string;
  saveError: string;
  createDraft: string;
};

type SavedTeardown = {
  id: string;
  createdAt: string;
  collectionId: string | null;
  teardown: ResearchTeardown;
};

export function ResearchTeardownPanel({
  workspaceSlug,
  locale,
  canManage,
  initialSaved,
  collections,
  collectionLabels,
  labels,
}: {
  workspaceSlug: string;
  locale: string;
  canManage: boolean;
  initialSaved: SavedTeardown[];
  collections: ResearchCollectionOption[];
  collectionLabels: {
    label: string;
    noCollection: string;
    error: string;
  };
  labels: Labels;
}) {
  const [notes, setNotes] = React.useState("");
  const [result, setResult] = React.useState<ResearchTeardown | null>(null);
  const [saved, setSaved] = React.useState(initialSaved);
  const [savedResultId, setSavedResultId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function runTeardown(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notes.trim()) {
      setError(labels.notesRequired);
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/research/teardown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceSlug, notes }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      teardown?: ResearchTeardown;
      error?: string;
    };
    if (!response.ok || !body.teardown) {
      setError(body.error === "research_teardown_disabled" ? labels.unavailable : labels.error);
      setPending(false);
      return;
    }
    setResult(body.teardown);
    setSavedResultId(null);
    setPending(false);
  }

  async function saveTeardown() {
    if (!result || !canManage || saving || savedResultId) return;
    setSaving(true);
    setError(null);
    const response = await fetch("/api/research/teardown/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceSlug, teardown: result }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      teardown?: { id: string; createdAt: string; result: ResearchTeardown };
    };
    if (!response.ok || !body.teardown) {
      setError(labels.saveError);
      setSaving(false);
      return;
    }
    setSavedResultId(body.teardown.id);
    setSaved((current) => [
      {
        id: body.teardown!.id,
        createdAt: body.teardown!.createdAt,
        collectionId: null,
        teardown: body.teardown!.result,
      },
      ...current,
    ]);
    setSaving(false);
  }

  return (
    <section className="space-y-4" aria-labelledby="research-teardown-title">
      <div className="flex items-start gap-3">
        <Sparkles className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <h2
            id="research-teardown-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {labels.title}
          </h2>
          <p className="text-body text-fg-secondary mt-1">{labels.description}</p>
        </div>
      </div>

      <Card padding="md">
        <form className="space-y-3" onSubmit={runTeardown}>
          <label
            htmlFor="research-teardown-source"
            className="text-label text-fg-primary block font-semibold"
          >
            {labels.sourceLabel}
          </label>
          <DirAwareTextarea
            id="research-teardown-source"
            locale={locale}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={labels.sourcePlaceholder}
            rows={7}
            aria-describedby="research-teardown-source-help"
          />
          <p id="research-teardown-source-help" className="text-label text-fg-muted">
            {labels.description}
          </p>
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {pending ? labels.running : labels.run}
          </Button>
        </form>
        {error ? (
          <p className="text-label text-danger mt-3" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      {result ? (
        <Card padding="md" className="space-y-5" data-testid="research-teardown-result">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="text-success h-5 w-5" aria-hidden="true" />
              <h3 className="text-title-card text-fg-primary font-semibold">{labels.title}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{savedResultId ? labels.saved : labels.previewOnly}</Badge>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={saveTeardown}
                  disabled={saving || savedResultId !== null}
                  aria-busy={saving || undefined}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? labels.saving : savedResultId ? labels.saved : labels.save}
                </Button>
              ) : null}
              {savedResultId ? (
                <Button type="button" size="sm" asChild>
                  <Link
                    href={`/app/w/${encodeURIComponent(workspaceSlug)}/planning/new?researchTeardownId=${encodeURIComponent(savedResultId)}`}
                  >
                    {labels.createDraft}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            {[
              [labels.hook, result.hook],
              [labels.promise, result.promise],
              [labels.format, result.format],
              [labels.pacing, result.pacing],
              [labels.callToAction, result.callToAction],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-label text-fg-muted font-semibold">{label}</dt>
                <dd className="text-body text-fg-primary mt-1">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h4 className="text-label text-fg-primary font-semibold">{labels.beats}</h4>
            <ol className="mt-2 space-y-2">
              {result.beats.map((beat) => (
                <li
                  key={`${beat.label}-${beat.description}`}
                  className="text-body text-fg-secondary"
                >
                  <span className="text-fg-primary font-semibold">{beat.label}:</span>{" "}
                  {beat.description}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h4 className="text-label text-fg-primary font-semibold">{labels.evidence}</h4>
            <ul className="mt-2 space-y-2">
              {result.evidence.map((item) => (
                <li
                  key={`${item.field}-${item.observation}`}
                  className="text-body text-fg-secondary"
                >
                  <span className="text-fg-primary font-semibold">{item.field}:</span>{" "}
                  {item.observation} <span className="text-fg-muted">({item.source})</span>
                </li>
              ))}
            </ul>
          </div>

          {result.uncertainty.length > 0 ? (
            <div className="border-warning bg-warning-subtle rounded-[var(--radius-control)] border p-3">
              <h4 className="text-label text-fg-primary font-semibold">{labels.uncertainty}</h4>
              <ul className="text-body text-fg-secondary mt-2 list-disc ps-5">
                {result.uncertainty.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {saved.length > 0 ? (
        <Card padding="md" className="space-y-3" data-testid="research-teardown-saved">
          <div>
            <h3 className="text-title-card text-fg-primary font-semibold">{labels.savedTitle}</h3>
            <p className="text-body text-fg-secondary mt-1">{labels.savedDescription}</p>
          </div>
          <ul className="divide-border divide-y">
            {saved.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="text-body text-fg-primary truncate font-semibold">
                    {item.teardown.hook}
                  </p>
                  <p className="text-label text-fg-muted mt-1">{item.teardown.format}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                      new Date(item.createdAt),
                    )}
                  </Badge>
                  {canManage ? (
                    <ResearchCollectionPicker
                      workspaceSlug={workspaceSlug}
                      itemKind="teardown"
                      itemId={item.id}
                      initialCollectionId={item.collectionId}
                      collections={collections}
                      label={collectionLabels.label}
                      noCollection={collectionLabels.noCollection}
                      errorLabel={collectionLabels.error}
                    />
                  ) : null}
                  {canManage ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/app/w/${encodeURIComponent(workspaceSlug)}/planning/new?researchTeardownId=${encodeURIComponent(item.id)}`}
                      >
                        {labels.createDraft}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
