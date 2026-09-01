"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  LifeBuoy,
  Monitor,
  RotateCcw,
  Smartphone,
  Wifi,
} from "lucide-react";
import { DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { recordErrorBoundaryAction } from "./error-actions";
import { cn } from "@/lib/utils";
import { formatErrorReport, matchErrorHint, type ErrorHint } from "@/lib/observability/error-hints";
import { getClientT } from "@/lib/i18n/client-locale";

/**
 * Error boundary for the authenticated app shell.
 *
 * Two responsibilities, in order:
 *
 *   1. **Tell the user what happened and what to do next.** The page
 *      shows a bento-grid summary card (what, where, when, who), a
 *      `Root cause` card that maps the captured error to one of the
 *      patterns in `error-hints.ts` and lists 2–3 concrete fixes, the
 *      raw stack + component stack behind a disclosure, and a
 *      "Copy full report" button that drops a markdown report on
 *      the clipboard. Recovery actions (Try again, Back to My Work,
 *      Sign out) are right there.
 *
 *   2. **Persist the event to the in-app mirror.** On mount we fire
 *      `recordErrorBoundaryAction`, which writes the row to
 *      `app_error_event` and resolves the matching row id so the
 *      "Open in platform errors" deep-link can target the exact
 *      row. The link is only shown when the actor is a platform
 *      admin (the server action returns the boolean; we do not
 *      need a separate permission round-trip).
 *
 * The action is fire-and-forget; the page renders fully without
 * waiting for it. A failed capture does not block the user — the
 * structured log + Sentry already captured the event.
 *
 * 2026-08-27 redesign — the previous boundary was a single
 * information-dense list. The new layout is a 2-column bento
 * grid on desktop / single column on mobile so each piece of
 * context has a clear visual home, and the user can copy a
 * complete markdown report (digest + route + cause + stack +
 * component stack + fix steps) without scrolling.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The boundary is the only client render that runs when the
  // server is broken. Read the public locale cookie so the hero
  // copy is bilingual; fall back to English (see client-locale.ts).
  const t = getClientT();
  const [copied, setCopied] = React.useState<"digest" | "report" | null>(null);
  const [stackOpen, setStackOpen] = React.useState(false);
  const [componentStackOpen, setComponentStackOpen] = React.useState(false);
  const [platformLink, setPlatformLink] = React.useState<{
    href: string;
    label: string;
  } | null>(null);
  // Env snapshot is taken on first mount (lazy initializer) so the
  // report includes viewport / locale / build without us calling
  // setState inside the capture effect (which would cascade a
  // re-render the lint rule would also reject).
  const [envSnapshot] = React.useState<{
    userAgent: string;
    locale: string;
    viewport: { width: number; height: number };
    buildVersion: string | null;
  }>(() => ({
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "(server)",
    locale: typeof navigator !== "undefined" ? navigator.language : "en",
    viewport:
      typeof window !== "undefined"
        ? { width: window.innerWidth, height: window.innerHeight }
        : { width: 0, height: 0 },
    // APP_VERSION is baked in at build time; NEXT_PUBLIC_ is the
    // client-side mirror. If the env doesn't carry it, leave the
    // field null and the row's `build_version` will be the
    // canonical link.
    buildVersion:
      (typeof process !== "undefined" && process.env["NEXT_PUBLIC_APP_VERSION"]) || null,
  }));

  const route = typeof window !== "undefined" ? window.location.pathname : "";
  const method = "GET";
  const reference = error.digest ?? "no-digest";
  // React 19 surfaces the component stack on the boundary via
  // the third arg of `error.tsx`. `error.stack` carries the JS
  // stack; the two are different. We pull both for the report.
  const componentStack = (error as Error & { componentStack?: string }).componentStack;
  const stack = error.stack;
  const errorName = error.name;
  // `cause` is one level deep — see safeCauseMessage in the
  // capture helper. Drizzle's "Failed query" wrapper hides the
  // real Postgres reason on `error.cause`; surfacing it here is
  // the difference between a useful error page and a wall of
  // opaque text.
  const causeMessage =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : undefined;

  // The hint is computed synchronously on every render — it's a
  // pure function over the captured fields, no I/O. We also keep a
  // memoized copy of the report markdown so opening/closing the
  // stack disclosure doesn't regenerate the string.
  const hint: ErrorHint = React.useMemo(
    () =>
      matchErrorHint({
        errorName,
        message: error.message,
        causeMessage,
        digest: error.digest,
        componentStack,
      }),
    [errorName, error.message, causeMessage, error.digest, componentStack],
  );
  const report = React.useMemo(
    () =>
      formatErrorReport({
        reference,
        route,
        method,
        message: error.message,
        errorName,
        causeMessage,
        digest: error.digest,
        ...(envSnapshot?.buildVersion ? { buildVersion: envSnapshot.buildVersion } : {}),
        ...(envSnapshot?.userAgent ? { userAgent: envSnapshot.userAgent } : {}),
        ...(envSnapshot?.viewport ? { viewport: envSnapshot.viewport } : {}),
        ...(envSnapshot?.locale ? { locale: envSnapshot.locale } : {}),
        occurredAt: new Date().toISOString(),
        hint,
        ...(stack ? { stack } : {}),
        ...(componentStack ? { componentStack } : {}),
      }),
    [
      reference,
      route,
      method,
      error.message,
      errorName,
      causeMessage,
      error.digest,
      envSnapshot,
      stack,
      componentStack,
      hint,
    ],
  );

  // Sentry + mirror capture on mount / digest change.
  React.useEffect(() => {
    Sentry.captureException(error, {
      tags: { route, digest: error.digest ?? "no-digest", boundary: "app.error" },
    });
    let cancelled = false;
    void (async () => {
      try {
        const result = await recordErrorBoundaryAction({
          digest: error.digest,
          route: route || "(unknown)",
          method,
          source: "app.error",
          message: error.message || error.name || "Unknown error",
          ...(errorName ? { errorName } : {}),
          ...(causeMessage ? { causeMessage } : {}),
          ...(stack ? { stack } : {}),
          ...(componentStack ? { componentStack } : {}),
        });
        if (cancelled) return;
        if (result.canViewPlatformErrors) {
          const href = result.matchedId
            ? `/app/platform/errors?focus=${encodeURIComponent(result.matchedId)}`
            : "/app/platform/errors";
          setPlatformLink({ href, label: t("errors.openInPlatformErrors") });
        }
      } catch {
        // Fail-silent on the capture path. The structured log + Sentry
        // already have the event; the mirror is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately depend only on the immutable parts of the
    // error. The `route` and other UI state shouldn't retrigger
    // the mirror write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const copyToClipboard = React.useCallback(async (text: string, which: "digest" | "report") => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for environments without async clipboard (e.g. some test runners).
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        // `execCommand` is deprecated but still the most portable
        // fallback; the linter's DOM lib types strip it from
        // HTMLTextAreaElement. Cast through `unknown` so the call
        // site doesn't depend on the deprecated type.
        (ta as unknown as { execCommand: (cmd: string) => boolean }).execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(which);
      window.setTimeout(() => setCopied((cur) => (cur === which ? null : cur)), 2000);
    } catch {
      // The user can still read the text and copy it manually.
    }
  }, []);

  const supportHref = buildSupportHref({
    route,
    reference,
    errorMessage: error.message,
    report,
  });

  // The id is stable for the lifetime of the error — used so the
  // disclosure buttons can `aria-controls` the right region.
  const stackRegionId = React.useId();
  const componentStackRegionId = React.useId();

  return (
    <div
      className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:py-12"
      data-testid="app-error-page"
    >
      {/* Hero: one-line summary + the recovery actions. */}
      <Card padding="lg" data-testid="app-error-summary">
        <div className="flex flex-wrap items-start gap-3">
          <span
            className="bg-danger-soft text-danger mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>{t("errors.appHeroTitle")}</CardTitle>
            <CardDescription>{t("errors.appHeroBody")}</CardDescription>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="app-error-actions">
          <Button onClick={reset} variant="default" data-testid="app-error-retry">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("errors.tryAgain")}
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">{t("errors.backToMyWork")}</Link>
          </Button>
          <Button
            size="default"
            variant="outline"
            onClick={() => void copyToClipboard(report, "report")}
            data-testid="app-error-copy-report"
          >
            {copied === "report" ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied === "report" ? t("errors.reportCopied") : t("errors.copyFullReport")}
          </Button>
          <a
            href={supportHref}
            className={cn(buttonVariants({ variant: "ghost" }))}
            data-testid="app-error-report"
          >
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            {t("errors.reportThis")}
          </a>
          {platformLink ? (
            <Button asChild variant="outline" data-testid="app-error-platform-link">
              <Link href={platformLink.href}>
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                {t("errors.openInPlatformErrors")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Bento grid: context + root-cause on top, raw data below. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* What / Where / When / Who — the "I need to know what
            happened" cell. */}
        <Card padding="md" data-testid="app-error-context" className="md:col-span-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Where & when</CardTitle>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ContextRow label="Reference">
              <div className="flex items-center gap-2">
                <code
                  data-testid="app-error-digest"
                  className="text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono text-sm"
                >
                  {reference}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void copyToClipboard(reference, "digest")}
                  aria-label={
                    copied === "digest" ? t("errors.referenceCopied") : t("errors.copyReference")
                  }
                  data-testid="app-error-copy-digest"
                >
                  {copied === "digest" ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied === "digest" ? t("errors.copied") : t("errors.copy")}
                </Button>
              </div>
            </ContextRow>
            <ContextRow label="Route">
              <code
                data-testid="app-error-route"
                className="text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono text-sm break-all"
              >
                {route || "(unknown)"}
              </code>
            </ContextRow>
            <ContextRow label="Error class">
              <code
                data-testid="app-error-name"
                className="text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono text-sm"
              >
                {errorName || "(unknown)"}
              </code>
            </ContextRow>
            <ContextRow label="Build">
              <code
                data-testid="app-error-build"
                className="text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono text-sm break-all"
              >
                {envSnapshot?.buildVersion ?? "(local build)"}
              </code>
            </ContextRow>
            {causeMessage ? (
              <ContextRow label="Cause" className="sm:col-span-2">
                <p
                  data-testid="app-error-cause"
                  className="text-body text-fg-secondary break-words"
                >
                  {causeMessage}
                </p>
              </ContextRow>
            ) : null}
            {error.message ? (
              <ContextRow label="Message" className="sm:col-span-2">
                <p
                  data-testid="app-error-message"
                  className="text-body text-fg-secondary break-words"
                >
                  {error.message}
                </p>
              </ContextRow>
            ) : null}
          </dl>
        </Card>

        {/* Environment — the "I need to know who / what" cell. */}
        <Card padding="md" data-testid="app-error-environment">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Environment</CardTitle>
          </div>
          <dl className="mt-3 space-y-2">
            <EnvRow
              icon={<Monitor className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Viewport"
              value={
                envSnapshot ? `${envSnapshot.viewport.width}×${envSnapshot.viewport.height}` : "…"
              }
            />
            <EnvRow
              icon={<Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Locale"
              value={envSnapshot?.locale ?? "…"}
            />
            <EnvRow
              icon={<Wifi className="h-3.5 w-3.5" aria-hidden="true" />}
              label="User agent"
              value={envSnapshot?.userAgent ?? "…"}
              truncate
            />
          </dl>
        </Card>

        {/* Root cause — the "what is this and what to do" cell. The
            pattern matcher in error-hints.ts maps the captured
            fields to one of ~8 known shapes; the fallback
            ("unknown") still ships useful generic steps. */}
        <Card padding="md" data-testid="app-error-hint" className="md:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="bg-primary-soft text-primary inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase"
              data-testid="app-error-hint-id"
            >
              {hint.id}
            </span>
            <CardTitle className="text-base">{hint.title}</CardTitle>
          </div>
          <p data-testid="app-error-hint-why" className="text-body text-fg-secondary mt-2">
            {hint.why}
          </p>
          <div className="mt-3">
            <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">
              What to do next
            </p>
            <ol
              className="text-body text-fg-primary mt-2 list-decimal space-y-1 ps-5"
              data-testid="app-error-hint-fixes"
            >
              {hint.fixes.map((fix, i) => (
                <li key={i}>{fix}</li>
              ))}
            </ol>
          </div>
        </Card>

        {/* Stack + component stack are in their own card with
            disclosure controls so the page is scannable without
            being a wall of trace lines. */}
        {stack ? (
          <Card padding="md" data-testid="app-error-stack-card" className="md:col-span-3">
            <button
              type="button"
              onClick={() => setStackOpen((v) => !v)}
              aria-expanded={stackOpen}
              aria-controls={stackRegionId}
              className="text-body text-fg-primary focus-visible:ring-focus-ring inline-flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-0 py-0 text-start font-semibold focus-visible:ring-2 focus-visible:outline-none"
              data-testid="app-error-stack-toggle"
            >
              <span className="inline-flex items-center gap-2">
                {stackOpen ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
                Stack trace
                <span className="text-label text-fg-muted font-normal">
                  ({stack.split("\n").length} frames)
                </span>
              </span>
            </button>
            {stackOpen ? (
              <pre
                id={stackRegionId}
                data-testid="app-error-stack"
                className="bg-surface text-label text-fg-secondary mt-3 max-h-80 overflow-auto rounded-[var(--radius-control)] p-3 font-mono break-all whitespace-pre-wrap"
              >
                {stack}
              </pre>
            ) : null}
          </Card>
        ) : null}
        {componentStack ? (
          <Card padding="md" data-testid="app-error-component-stack-card" className="md:col-span-3">
            <button
              type="button"
              onClick={() => setComponentStackOpen((v) => !v)}
              aria-expanded={componentStackOpen}
              aria-controls={componentStackRegionId}
              className="text-body text-fg-primary focus-visible:ring-focus-ring inline-flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-0 py-0 text-start font-semibold focus-visible:ring-2 focus-visible:outline-none"
              data-testid="app-error-component-stack-toggle"
            >
              <span className="inline-flex items-center gap-2">
                {componentStackOpen ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
                Component stack
                <span className="text-label text-fg-muted font-normal">
                  ({componentStack.split("\n").filter(Boolean).length} frames)
                </span>
              </span>
            </button>
            {componentStackOpen ? (
              <pre
                id={componentStackRegionId}
                data-testid="app-error-component-stack"
                className="bg-surface text-label text-fg-secondary mt-3 max-h-80 overflow-auto rounded-[var(--radius-control)] p-3 font-mono break-all whitespace-pre-wrap"
              >
                {componentStack}
              </pre>
            ) : null}
          </Card>
        ) : null}
      </div>

      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title={t("errors.shareWithSupportTitle")}
        description={t("errors.shareWithSupportDescription")}
      />
    </div>
  );
}

function ContextRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-1 sm:grid-cols-[7rem_1fr] sm:items-baseline sm:gap-3",
        className,
      )}
    >
      <dt className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function EnvRow({
  icon,
  label,
  value,
  truncate = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="text-body flex items-start gap-2">
      <span className="text-fg-muted mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
          {label}
        </p>
        <p
          className={cn("text-fg-primary break-words", truncate && "truncate")}
          title={truncate ? value : undefined}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function buildSupportHref({
  route,
  reference,
  errorMessage,
  report,
}: {
  route: string;
  reference: string;
  errorMessage: string;
  report: string;
}): string {
  const subject = `laratik-planner error: ${reference}`;
  const body = [
    "Hi,",
    "",
    "I hit an error on the page below. The reference is already in our error log; the full report is below.",
    "",
    `Route: ${route || "(unknown)"}`,
    `Reference: ${reference}`,
    `Message: ${errorMessage || "(none)"}`,
    "",
    "----- Full report -----",
    report,
    "",
    "Steps I took right before the error:",
    "1. ",
    "2. ",
    "",
    "What I expected to happen:",
    "",
    "Thanks!",
  ].join("\n");
  // SUPPORT_EMAIL is server-side only; the default fallback is
  // hard-coded in env.ts so the page never 500s on a missing env.
  // Client components can't read serverEnv directly, so the
  // address is read from a NEXT_PUBLIC_ mirror at runtime — if
  // it is absent the mailto falls back to a generic address.
  const email =
    (typeof process !== "undefined" &&
      (process.env["NEXT_PUBLIC_SUPPORT_EMAIL"] || process.env["SUPPORT_EMAIL"])) ||
    "support@laratik.com";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Empty placeholder so TypeScript is happy with the unused
// import in dev builds. The form's actorId lives in the row we
// read from the DB; we just don't pass it through props.
// (Reserved for a future client-side session hook; leaving the
// anchor so the report template can adopt it without a re-flow.)
