"use client";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
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
  const t = useLocaleT();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? t("common.saving") : label}
    </Button>
  );
}

export function NewCampaignForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useLocaleT();
  const locale = useLocaleCode();
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
      <DirAwareInput
        name="name"
        required
        minLength={2}
        maxLength={120}
        locale={locale}
        placeholder={t("users.library.form.campaignName")}
      />
      <DirAwareInput
        name="objective"
        maxLength={2000}
        locale={locale}
        placeholder={t("users.library.form.objective")}
      />
      <div className="flex items-center gap-2">
        <DirAwareInput
          name="startDate"
          type="date"
          locale={locale}
          aria-label={t("users.library.form.startDate")}
        />
        <DirAwareInput
          name="endDate"
          type="date"
          locale={locale}
          aria-label={t("users.library.form.endDate")}
        />
        <DirAwareInput
          name="coverColor"
          locale={locale}
          placeholder="#rrggbb"
          pattern="#[0-9a-fA-F]{6}"
          aria-label={t("users.library.form.coverColor")}
          className="w-28"
        />
      </div>
      {error ? (
        <p className="text-label text-fg-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label={t("users.library.form.createCampaign")} />
      </div>
      {isPending ? <span className="sr-only">{t("users.library.form.submitting")}</span> : null}
    </form>
  );
}

export function NewPillarForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useLocaleT();
  const locale = useLocaleCode();
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
        <DirAwareInput
          name="name"
          required
          minLength={2}
          maxLength={80}
          locale={locale}
          placeholder={t("users.library.form.pillarName")}
          className="flex-1"
        />
        <DirAwareInput
          name="color"
          locale={locale}
          placeholder="#rrggbb"
          pattern="#[0-9a-fA-F]{6}"
          aria-label={t("users.library.form.pillarColor")}
          className="w-28"
        />
      </div>
      <DirAwareInput
        name="description"
        maxLength={2000}
        locale={locale}
        placeholder={t("users.library.form.description")}
      />
      {error ? (
        <p className="text-label text-fg-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label={t("users.library.form.createPillar")} />
      </div>
      {isPending ? <span className="sr-only">{t("users.library.form.submitting")}</span> : null}
    </form>
  );
}

export function NewTemplateForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useLocaleT();
  const locale = useLocaleCode();
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
        <DirAwareInput
          name="name"
          required
          minLength={2}
          maxLength={120}
          locale={locale}
          placeholder={t("users.library.form.templateName")}
          className="flex-1"
        />
        <select
          name="format"
          required
          className="border-border bg-surface text-body rounded-md border px-2 py-1"
          aria-label={t("users.library.form.format")}
        >
          <option value="static_post">{t("users.library.form.staticPost")}</option>
          <option value="carousel">{t("users.library.form.carousel")}</option>
          <option value="story">{t("users.library.form.story")}</option>
          <option value="short_form_video">{t("users.library.form.shortFormVideo")}</option>
          <option value="long_form_video">{t("users.library.form.longFormVideo")}</option>
          <option value="live_content">{t("users.library.form.liveContent")}</option>
          <option value="article">{t("users.library.form.article")}</option>
          <option value="other">{t("users.library.form.other")}</option>
        </select>
      </div>
      <DirAwareTextarea
        name="briefTemplate"
        maxLength={8000}
        locale={locale}
        placeholder={t("users.library.form.briefTemplate")}
        className="border-border bg-surface text-body w-full rounded-md border px-3 py-2"
        rows={3}
      />
      {error ? (
        <p className="text-label text-fg-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label={t("users.library.form.createTemplate")} />
      </div>
      {isPending ? <span className="sr-only">{t("users.library.form.submitting")}</span> : null}
    </form>
  );
}

export function ArchiveCampaignButton({ slug, id }: { slug: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useLocaleT();
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
        {t("common.rowActionArchive")}
      </Button>
    </span>
  );
}

export function ArchivePillarButton({ slug, id }: { slug: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useLocaleT();
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
        {t("common.rowActionArchive")}
      </Button>
    </span>
  );
}

export function ArchiveTemplateButton({ slug, id }: { slug: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useLocaleT();
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
        {t("common.rowActionArchive")}
      </Button>
    </span>
  );
}
