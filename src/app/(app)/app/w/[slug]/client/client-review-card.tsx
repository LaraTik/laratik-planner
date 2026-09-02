"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { decideApprovalAction } from "../planning/actions";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";

type ClientReviewCardProps = {
  workspaceSlug: string;
  requestId: string;
  title: string;
  deliveryDescription: string;
  deliveryVersion: number | null;
  plannedPublishAt: string;
  overdue: boolean;
  links: { id: string; label: string; url: string }[];
  /**
   * Bound translator from the parent. Resolves the Review
   * badge, the "Version N · publishes {date}" meta line, the
   * "Delivery files" listbox aria-label, the "No delivery
   * file is attached." warning, the feedback label + the
   * inline validation + catch errors, the Saving… pending
   * state, and the Approve / Request changes button labels.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
};

export function ClientReviewCard(props: ClientReviewCardProps) {
  const localeT = useLocaleT();
  const locale = useLocaleCode();
  const t = props.t ?? localeT;
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approved" | "changes_requested") => {
    setError(null);
    if (decision === "changes_requested" && !feedback.trim()) {
      setError(t("sidebar.clientReviewPage.feedbackRequiredError"));
      return;
    }
    startTransition(async () => {
      try {
        const result = await decideApprovalAction({
          workspaceSlug: props.workspaceSlug,
          approvalRequestId: props.requestId,
          decision,
          ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError(t("sidebar.clientReviewPage.saveFailedError"));
      }
    });
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle>{props.title}</CardTitle>
        <Badge variant={props.overdue ? "danger" : "info"}>
          {t("sidebar.clientReviewPage.badge")}
        </Badge>
      </div>
      <p className="text-body text-fg-secondary mt-2">{props.deliveryDescription}</p>
      <p className="text-label text-fg-muted mt-3">
        {t("sidebar.clientReviewPage.versionPublishes", {
          version: props.deliveryVersion ?? t("sidebar.clientReviewPage.noVersion"),
          date: formatDate(props.plannedPublishAt, locale, DateFormat.short),
        })}
      </p>

      {props.links.length ? (
        <ul className="mt-4 space-y-2" aria-label={t("sidebar.clientReviewPage.deliveryFilesAria")}>
          {props.links.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="text-body text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 font-semibold hover:underline focus:outline-none focus-visible:ring-2"
              >
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-label text-warning mt-4">
          {t("sidebar.clientReviewPage.noDeliveryFile")}
        </p>
      )}

      <label
        className="text-label text-fg-primary mt-5 block font-semibold"
        htmlFor={`feedback-${props.requestId}`}
      >
        {t("sidebar.clientReviewPage.feedbackLabel")}
      </label>
      <textarea
        id={`feedback-${props.requestId}`}
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        maxLength={2000}
        rows={3}
        className="border-border bg-canvas text-body focus:border-primary mt-2 w-full rounded-[var(--radius-control)] border px-3 py-2 outline-none"
      />
      {error ? (
        <p role="alert" className="text-label text-danger mt-2">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => decide("approved")}
          disabled={pending || !props.links.length}
        >
          {pending
            ? t("sidebar.clientReviewPage.saving")
            : t("sidebar.clientReviewPage.approveDelivery")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => decide("changes_requested")}
          disabled={pending}
        >
          {t("sidebar.clientReviewPage.requestChanges")}
        </Button>
      </div>
    </Card>
  );
}
