"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { FormSummary } from "@/components/forms/form-summary";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { formatDateInTimeZoneForInput } from "@/lib/utils/date";
import { quickCreateAction } from "../actions";

/**
 * Per-form human label map for the top-of-form summary card.
 * Keys are the form field names; values are the user-facing
 * labels that match the matching `<FormField label>` so the
 * summary's anchor-link text reads naturally.
 */
const initial: { error?: string; fieldErrors?: Record<string, string> } = {};

export function QuickCreateForm({
  workspaceSlug,
  workspaceTimezone,
  trendSignal,
  researchPost,
  researchTeardown,
}: {
  workspaceSlug: string;
  workspaceTimezone: string;
  trendSignal?: { id: string; label: string };
  researchPost?: {
    observation: {
      id: string;
      permalink: string | null;
      mediaType: string;
      views: number | null;
      likes: number | null;
      comments: number | null;
      publishedAt: Date | null;
    };
    channel: { accountName: string; platform: string };
  };
  researchTeardown?: {
    id: string;
    hook: string;
    promise: string;
    format: string;
    pacing: string;
    callToAction: string;
    beats: { label: string; description: string }[];
  };
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const boundAction = quickCreateAction.bind(null, workspaceSlug);
  const [state, formAction] = useActionState(boundAction, initial);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const researchAccount = researchPost?.channel.accountName ?? "";
  const teardownBrief = researchTeardown
    ? [
        `Hook: ${researchTeardown.hook}`,
        `Promise: ${researchTeardown.promise}`,
        `Format: ${researchTeardown.format}`,
        `Pacing: ${researchTeardown.pacing}`,
        `CTA: ${researchTeardown.callToAction}`,
        researchTeardown.beats.length > 0
          ? `Beats:\n${researchTeardown.beats.map((beat) => `- ${beat.label}: ${beat.description}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1_900)
    : "";
  const [title, setTitle] = React.useState(
    trendSignal?.label ??
      (researchPost
        ? t("quickCreate.research.referenceTitle", { account: researchAccount })
        : researchTeardown
          ? t("quickCreate.research.teardownTitle", { hook: researchTeardown.hook.slice(0, 140) })
          : ""),
  );
  const [brief, setBrief] = React.useState(
    trendSignal
      ? `Trend angle: ${trendSignal.label}`
      : researchPost
        ? t("quickCreate.research.initialBrief", { account: researchAccount })
        : teardownBrief,
  );

  // Default the planned date to *workspace-local* tomorrow 9am.
  // The previous `toISOString().slice(0, 16)` translated the instant
  // to UTC and then re-formatted it as YYYY-MM-DDTHH:mm, so a Berlin
  // planner choosing 9 AM saw a default of 07:00 (UTC) on the form —
  // and the value they didn't touch would round-trip as 7 AM UTC
  // instead of 9 AM Berlin. `formatDateInTimeZoneForInput` formats
  // the wall-clock in the workspace timezone (`workspaceTimezone`),
  // not the browser's local clock, so a New York user working on a
  // Berlin workspace still sees the 9 AM Berlin reading.
  const tomorrowUtc = new Date();
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
  tomorrowUtc.setUTCHours(9, 0, 0, 0);
  const defaultPlanned = formatDateInTimeZoneForInput(tomorrowUtc, workspaceTimezone);

  // When the Server Action returns a `fieldErrors` map, the
  // first invalid control is focused on the next paint so
  // keyboard users land on the offender. Per WIG §Forms:
  // "focus first error on submit".
  React.useEffect(() => {
    if (state?.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      // Defer one frame so the FormField has rendered the
      // `aria-invalid="true"` attribute the helper looks for.
      const handle = window.setTimeout(() => {
        focusFirstInvalid(formRef.current);
      }, 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [state?.fieldErrors]);

  // WIG: "Warn before navigation with unsaved changes". The
  // create form is short, but the user may paste a long
  // brief and then click Back by accident.
  useBeforeunloadDirtyGuard(formRef);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      noValidate
      data-testid="quick-create-form"
    >
      {trendSignal ? <input type="hidden" name="trendSignalId" value={trendSignal.id} /> : null}
      {researchPost ? (
        <input type="hidden" name="researchPostObservationId" value={researchPost.observation.id} />
      ) : null}
      {trendSignal ? (
        <aside className="border-accent/30 bg-accent/10 text-fg-primary rounded-[var(--radius-control)] border p-3">
          <p className="text-label font-semibold">
            {t("trends.card.useInBrief") || "Use in brief"}
          </p>
          <p className="text-body mt-1">
            <bdi>{trendSignal.label}</bdi>
          </p>
        </aside>
      ) : null}
      {researchTeardown ? (
        <aside
          className="border-primary/30 bg-primary-subtle/30 text-fg-primary rounded-[var(--radius-control)] border p-3"
          data-testid="quick-create-research-teardown"
        >
          <p className="text-label font-semibold">{t("quickCreate.research.teardownEyebrow")}</p>
          <p className="text-body mt-1">{researchTeardown.hook}</p>
          <p className="text-label text-fg-secondary mt-1">
            {researchTeardown.format} · {t("quickCreate.research.teardownEditable")}
          </p>
          <input type="hidden" name="researchTeardownId" value={researchTeardown.id} />
        </aside>
      ) : null}
      {researchPost ? (
        <aside
          className="border-primary/30 bg-primary-subtle/30 text-fg-primary rounded-[var(--radius-control)] border p-3"
          data-testid="quick-create-research-reference"
        >
          <p className="text-label font-semibold">{t("quickCreate.research.eyebrow")}</p>
          <p className="text-body mt-1">
            <bdi>{researchAccount}</bdi> · <bdi>{researchPost.channel.platform}</bdi>
          </p>
          <p className="text-label text-fg-secondary mt-1">
            {researchPost.observation.views ?? 0} {t("quickCreate.research.views")} ·{" "}
            {researchPost.observation.likes ?? 0} {t("quickCreate.research.likes")} ·{" "}
            {researchPost.observation.comments ?? 0} {t("quickCreate.research.comments")}
          </p>
          <p className="text-label text-fg-muted mt-1">{t("quickCreate.research.description")}</p>
          {researchPost.observation.permalink ? (
            <a
              href={researchPost.observation.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-label text-primary focus-visible:ring-focus-ring mt-2 inline-flex rounded font-semibold focus:outline-none focus-visible:ring-2"
            >
              {t("quickCreate.research.openSource")}
            </a>
          ) : null}
        </aside>
      ) : null}
      <FormSummary
        {...(state?.error ? { error: state.error } : {})}
        {...(state?.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
        fieldLabels={{
          title: t("quickCreate.form.title"),
          format: t("quickCreate.form.format"),
          plannedPublishAt: t("quickCreate.form.plannedPublish"),
          brief: t("quickCreate.form.briefSummary"),
          channelIds: t("quickCreate.form.channels"),
        }}
      />

      <FormField
        id="title"
        label={t("quickCreate.form.title")}
        hint={t("quickCreate.form.titleHint")}
        required
        {...(state?.fieldErrors?.title ? { error: state.fieldErrors.title } : {})}
      >
        <DirAwareInput
          type="text"
          name="title"
          required
          minLength={2}
          maxLength={200}
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("quickCreate.form.titlePlaceholder")}
          locale={locale}
          className="min-h-11"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          id="format"
          label={t("quickCreate.form.format")}
          hint={t("quickCreate.form.formatHint")}
          required
          {...(state?.fieldErrors?.format ? { error: state.fieldErrors.format } : {})}
        >
          <select
            name="format"
            required
            defaultValue={
              researchPost && ["video", "reel"].includes(researchPost.observation.mediaType)
                ? "short_form_video"
                : "static_post"
            }
            className="border-border bg-surface text-fg-primary text-body focus-visible:ring-focus-ring flex min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <option value="static_post">{t("planningFilters.formatLabels.static_post")}</option>
            <option value="carousel">{t("planningFilters.formatLabels.carousel")}</option>
            <option value="story">{t("planningFilters.formatLabels.story")}</option>
            <option value="short_form_video">
              {t("planningFilters.formatLabels.short_form_video")}
            </option>
            <option value="long_form_video">
              {t("planningFilters.formatLabels.long_form_video")}
            </option>
            <option value="live_content">{t("planningFilters.formatLabels.live_content")}</option>
            <option value="article">{t("planningFilters.formatLabels.article")}</option>
            <option value="other">{t("planningFilters.formatLabels.other")}</option>
          </select>
        </FormField>
        <FormField
          id="plannedPublishAt"
          label={t("quickCreate.form.plannedPublish")}
          hint={t("quickCreate.form.plannedPublishHint")}
          required
          {...(state?.fieldErrors?.plannedPublishAt
            ? { error: state.fieldErrors.plannedPublishAt }
            : {})}
        >
          <Input
            type="datetime-local"
            name="plannedPublishAt"
            required
            defaultValue={defaultPlanned}
          />
        </FormField>
      </div>

      <FormField
        id="brief"
        label={t("quickCreate.form.briefOptional")}
        hint={t("quickCreate.form.briefHint")}
        {...(state?.fieldErrors?.brief ? { error: state.fieldErrors.brief } : {})}
      >
        <DirAwareTextarea
          name="brief"
          rows={4}
          maxLength={2000}
          autoComplete="off"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={t("quickCreate.form.briefPlaceholder")}
          locale={locale}
        />
      </FormField>

      <aside
        className="border-primary/25 bg-primary-subtle/30 text-fg-secondary rounded-[var(--radius-control)] border p-3"
        data-testid="quick-create-what-next"
      >
        <p className="text-body text-fg-primary font-semibold">
          {t("quickCreate.form.whatNextTitle")}
        </p>
        <p className="text-label mt-1">{t("quickCreate.form.whatNextBody")}</p>
      </aside>

      <div className="flex items-center gap-3 pt-2">
        <FormSubmitButton
          label={t("quickCreate.form.createDraft")}
          pendingLabel={t("quickCreate.form.creating")}
          size="lg"
        />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${workspaceSlug}/planning`}>{t("quickCreate.form.cancel")}</a>
        </Button>
      </div>
    </form>
  );
}
