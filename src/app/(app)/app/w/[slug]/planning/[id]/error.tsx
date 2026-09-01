"use client";

/**
 * Per-route error boundary for /app/w/[slug]/planning/[id] — the
 * content detail page.
 *
 * Why this exists separately from `src/app/(app)/app/w/[slug]/planning/error.tsx`:
 *  - The planning-list error boundary ("We hit an error rendering
 *    Planning") was being used as a catch-all for the detail page
 *    too, because Next.js 16 bubbles render errors to the closest
 *    `error.tsx` ancestor. That message is misleading on the
 *    detail page (which has its own "Content · 260aa351" identity).
 *  - This file gives the detail page its own copy + a more
 *    specific "Back to Planning list" link, while the list
 *    boundary keeps its "Back to Planning" wording.
 *  - It also surfaces the per-route `error.digest` so the
 *    on-call view can correlate with the Sentry event
 *    (`tags.section = planning-detail`).
 *
 * The boundary mirrors the structure of the list-page boundary so
 * the look-and-feel stays consistent across the planning surface.
 */
import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { AlertTriangle } from "lucide-react";
import { getClientT } from "@/lib/i18n/client-locale";

export default function ContentDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Error boundary copy uses the public `laratik_locale` cookie
  // (set by the profile-save action and the public locale
  // switcher). On the server this returns the English translator;
  // on the client it resolves to the visitor's most recent
  // preference.
  const t = getClientT();
  const params = useParams<{ slug: string; id: string }>();
  const listHref = params?.slug ? `/app/w/${params.slug}/planning` : "/app";

  React.useEffect(() => {
    Sentry.captureException(error, { tags: { section: "planning-detail" } });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
        title={t("errors.planningDetailTitle")}
        description={t("errors.planningDetailDescription")}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} variant="default">
              {t("errors.tryAgain")}
            </Button>
            <Button asChild variant="secondary">
              <Link href={listHref}>{t("errors.backToPlanning")}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app">{t("errors.backToMyWork")}</Link>
            </Button>
          </div>
        }
      />
      {error.digest ? (
        <p
          data-testid="content-detail-error-digest"
          className="text-label text-fg-muted mt-4 text-center"
        >
          {t("errors.referenceLabel")}{" "}
          <code className="bg-surface-subtle rounded px-1.5 py-0.5 font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
