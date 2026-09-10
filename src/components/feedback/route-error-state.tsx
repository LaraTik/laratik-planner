"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { getClientT } from "@/lib/i18n/client-locale";

interface RouteErrorStateProps {
  title: string;
  description: string;
  reset: () => void;
  backHref: string;
  backLabel: string;
  errorDigest: string | undefined;
  dataTestId: string;
}

/** Shared recovery surface for route-level errors inside the app shell. */
export function RouteErrorState({
  title,
  description,
  reset,
  backHref,
  backLabel,
  errorDigest,
  dataTestId,
}: RouteErrorStateProps) {
  const t = getClientT();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12" data-testid={dataTestId} role="alert">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} variant="default">
              {t("errors.tryAgain")}
            </Button>
            <Button asChild variant="secondary">
              <Link href={backHref}>{backLabel}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app">{t("errors.backToMyWork")}</Link>
            </Button>
          </div>
        }
      />
      {errorDigest ? (
        <p className="text-label text-fg-muted mt-4 text-center">
          {t("errors.referenceLabel")}{" "}
          <code className="bg-surface-subtle rounded px-1.5 py-0.5 font-mono">{errorDigest}</code>
        </p>
      ) : null}
    </div>
  );
}
