"use client";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveCampaignAction,
  archivePillarAction,
  archiveTemplateAction,
  createCampaignAction,
  createPillarAction,
  createTemplateAction,
} from "./actions";

/**
 * Planning library forms (FEAT-06).
 *
 * The library page is a Server Component; these small client islands
 * host the `useTransition` + `useFormStatus` plumbing for each
 * "New ..." / "Archive" action. Each one is a self-contained form so
 * the page layout doesn't need a per-section form provider.
 *
 * Why a client component per action rather than one big modal: the
 * Stitch design calls for inline section headers, and a per-section
 * form gives the planner a clear "save / cancel" rhythm without
 * stacking modals.
 */

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function NewCampaignForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const action = createCampaignAction.bind(null, slug);
  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await action({}, formData);
          if (result.error) setError(result.error);
        });
      }}
      className="border-border bg-surface-subtle mt-3 space-y-2 rounded-md border p-3"
      data-testid="library-new-campaign-form"
    >
      <Input name="name" required minLength={2} maxLength={120} placeholder="Campaign name" />
      <Input name="objective" maxLength={2000} placeholder="Objective (optional)" />
      <div className="flex items-center gap-2">
        <Input name="startDate" type="date" aria-label="Start date" />
        <Input name="endDate" type="date" aria-label="End date" />
        <Input
          name="coverColor"
          placeholder="#rrggbb"
          pattern="#[0-9a-fA-F]{6}"
          aria-label="Cover color"
          className="w-28"
        />
      </div>
      {error ? (
        <p className="text-label text-fg-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label="Create campaign" />
      </div>
      {isPending ? <span className="sr-only">Submitting</span> : null}
    </form>
  );
}

export function NewPillarForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const action = createPillarAction.bind(null, slug);
  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await action({}, formData);
          if (result.error) setError(result.error);
        });
      }}
      className="border-border bg-surface-subtle mt-3 space-y-2 rounded-md border p-3"
      data-testid="library-new-pillar-form"
    >
      <div className="flex items-center gap-2">
        <Input
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="Pillar name"
          className="flex-1"
        />
        <Input
          name="color"
          placeholder="#rrggbb"
          pattern="#[0-9a-fA-F]{6}"
          aria-label="Pillar color"
          className="w-28"
        />
      </div>
      <Input name="description" maxLength={2000} placeholder="Description (optional)" />
      {error ? (
        <p className="text-label text-fg-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label="Create pillar" />
      </div>
      {isPending ? <span className="sr-only">Submitting</span> : null}
    </form>
  );
}

export function NewTemplateForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const action = createTemplateAction.bind(null, slug);
  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await action({}, formData);
          if (result.error) setError(result.error);
        });
      }}
      className="border-border bg-surface-subtle mt-3 space-y-2 rounded-md border p-3"
      data-testid="library-new-template-form"
    >
      <div className="flex items-center gap-2">
        <Input
          name="name"
          required
          minLength={2}
          maxLength={120}
          placeholder="Template name"
          className="flex-1"
        />
        <select
          name="format"
          required
          className="border-border bg-surface text-body rounded-md border px-2 py-1"
          aria-label="Format"
        >
          <option value="static_post">Static post</option>
          <option value="carousel">Carousel</option>
          <option value="story">Story</option>
          <option value="short_form_video">Short-form video</option>
          <option value="long_form_video">Long-form video</option>
          <option value="live_content">Live content</option>
          <option value="article">Article</option>
          <option value="other">Other</option>
        </select>
      </div>
      <textarea
        name="briefTemplate"
        maxLength={8000}
        placeholder="Brief template (optional)"
        className="border-border bg-surface text-body w-full rounded-md border px-3 py-2"
        rows={3}
      />
      {error ? (
        <p className="text-label text-fg-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label="Create template" />
      </div>
      {isPending ? <span className="sr-only">Submitting</span> : null}
    </form>
  );
}

export function ArchiveCampaignButton({ slug, id }: { slug: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {error ? (
        <span className="text-label text-fg-danger" role="alert">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await archiveCampaignAction(slug, id);
            if (result.error) setError(result.error);
          });
        }}
        data-testid={`library-archive-campaign-${id}`}
      >
        Archive
      </Button>
    </span>
  );
}

export function ArchivePillarButton({ slug, id }: { slug: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {error ? (
        <span className="text-label text-fg-danger" role="alert">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await archivePillarAction(slug, id);
            if (result.error) setError(result.error);
          });
        }}
        data-testid={`library-archive-pillar-${id}`}
      >
        Archive
      </Button>
    </span>
  );
}

export function ArchiveTemplateButton({ slug, id }: { slug: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {error ? (
        <span className="text-label text-fg-danger" role="alert">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await archiveTemplateAction(slug, id);
            if (result.error) setError(result.error);
          });
        }}
        data-testid={`library-archive-template-${id}`}
      >
        Archive
      </Button>
    </span>
  );
}
