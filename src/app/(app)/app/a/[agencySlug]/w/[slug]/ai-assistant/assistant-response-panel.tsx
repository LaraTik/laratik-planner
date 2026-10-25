"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AssistantProposal,
  AssistantReply,
  AssistantResponseLabels,
} from "./assistant-ui-types";

type AssistantResponsePanelProps = {
  reply: AssistantReply;
  locale: string;
  workspaceTimezone: string;
  currentTime: number;
  labels: AssistantResponseLabels;
  mode: "ask" | "plan" | "apply";
  selectedProposalIds: string[];
  selectedProposals: AssistantProposal[];
  canApplySelectedProposals: boolean;
  proposalError: boolean;
  onSelectProposal: (proposalId: string, selected: boolean) => void;
  onApplySelectedProposals: (proposalIds: string[]) => void;
  onDecideProposal: (proposalId: string, decision: "apply" | "reject") => void;
};

export function AssistantResponsePanel({
  reply,
  locale,
  workspaceTimezone,
  currentTime,
  labels,
  mode,
  selectedProposalIds,
  selectedProposals,
  canApplySelectedProposals,
  proposalError,
  onSelectProposal,
  onApplySelectedProposals,
  onDecideProposal,
}: AssistantResponsePanelProps) {
  return (
    <div className="border-border mx-auto mt-5 max-w-3xl space-y-4 border-t pt-4">
      {reply.reviewedPlanMonth ? (
        <p className="text-label text-fg-muted" role="status">
          {labels.reviewedPlan}: {formatPlanMonth(reply.reviewedPlanMonth, locale)}
        </p>
      ) : null}
      {reply.referencedItem ? (
        <p className="text-label text-fg-muted" role="status">
          {labels.selectedContent}: {reply.referencedItem.title} · revision{" "}
          {reply.referencedItem.revision}
        </p>
      ) : null}
      {reply.deterministicFindings.length ? (
        <section aria-label={labels.findGaps}>
          <h3 className="text-title-card text-fg-primary font-semibold">{labels.findGaps}</h3>
          <ul className="mt-2 space-y-2">
            {reply.deterministicFindings.map((finding, index) => (
              <li
                key={`${finding.title}-${index}`}
                className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
              >
                <p className="text-body text-fg-primary font-semibold">{finding.title}</p>
                <p className="text-body text-fg-secondary mt-1">{finding.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reply.answer.findings.length ? (
        <section aria-label={labels.findings}>
          <h3 className="text-title-card text-fg-primary font-semibold">{labels.findings}</h3>
          <ul className="mt-2 space-y-2">
            {reply.answer.findings.map((item, index) => (
              <li
                key={`${item.title}-${index}`}
                className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
              >
                <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                <p className="text-body text-fg-secondary mt-1">{item.detail}</p>
                <div className="text-label text-fg-muted mt-2 flex flex-wrap items-center gap-2">
                  <span>{labels.evidence}:</span>
                  {item.evidenceIds.map((id) => (
                    <a
                      key={id}
                      className="text-primary underline underline-offset-2"
                      href={`#assistant-evidence-${encodeURIComponent(id)}`}
                    >
                      {id}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reply.answer.recommendations.length ? (
        <section aria-label={labels.recommendations}>
          <h3 className="text-title-card text-fg-primary font-semibold">
            {labels.recommendations}
          </h3>
          <ul className="mt-2 space-y-2">
            {reply.answer.recommendations.map((item, index) => (
              <li
                key={`${item.title}-${index}`}
                className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
              >
                <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                <p className="text-body text-fg-secondary mt-1">{item.detail}</p>
                <div className="text-label text-fg-muted mt-2 flex flex-wrap items-center gap-2">
                  <span>{labels.evidence}:</span>
                  {item.evidenceIds.map((id) => (
                    <a
                      key={id}
                      className="text-primary underline underline-offset-2"
                      href={`#assistant-evidence-${encodeURIComponent(id)}`}
                    >
                      {id}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reply.proposals.length ? (
        <section aria-label={labels.proposedEdits} data-testid="assistant-proposals">
          <h3 className="text-title-card text-fg-primary font-semibold">{labels.proposedEdits}</h3>
          {selectedProposalIds.length >= 2 ? (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={mode !== "apply" || !canApplySelectedProposals}
                onClick={() => onApplySelectedProposals(selectedProposals.map((item) => item.id))}
              >
                {selectedProposals.some((proposal) => proposal.status === "applying")
                  ? labels.applyingSelectedEdits
                  : `${labels.applySelectedEdits} (${selectedProposals.length})`}
              </Button>
            </div>
          ) : null}
          <ul className="mt-2 space-y-2">
            {reply.proposals.map((proposal) => {
              const expired =
                proposal.status === "proposed" &&
                currentTime > 0 &&
                new Date(proposal.expiresAt).getTime() <= currentTime;
              const status = expired ? "expired" : proposal.status;
              const pending = status === "proposed";
              const statusLabel =
                status === "applied"
                  ? labels.editApplied
                  : status === "rejected"
                    ? labels.editRejected
                    : status === "stale"
                      ? labels.editStale
                      : status === "expired"
                        ? labels.editExpired
                        : status === "applying"
                          ? labels.applyingEdit
                          : "";
              return (
                <li
                  key={proposal.id}
                  className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                >
                  {pending ? (
                    <div className="mb-2 flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`assistant-proposal-select-${proposal.id}`}
                        checked={selectedProposalIds.includes(proposal.id)}
                        onCheckedChange={(checked) =>
                          onSelectProposal(proposal.id, checked === true)
                        }
                      />
                      <label
                        htmlFor={`assistant-proposal-select-${proposal.id}`}
                        className="text-label text-fg-secondary cursor-pointer"
                      >
                        {labels.selectProposal}
                      </label>
                    </div>
                  ) : null}
                  <p className="text-body text-fg-primary font-semibold">{proposal.title}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-label text-fg-muted">{labels.before}</p>
                      <p className="text-body text-fg-secondary whitespace-pre-wrap" dir="auto">
                        {proposal.field === "plannedPublishAt"
                          ? formatProposalDate(proposal.beforeValue, locale, workspaceTimezone)
                          : proposal.beforeValue || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-label text-fg-muted">{labels.after}</p>
                      <p className="text-body text-fg-primary whitespace-pre-wrap" dir="auto">
                        {proposal.field === "plannedPublishAt"
                          ? formatProposalDate(proposal.afterValue, locale, workspaceTimezone)
                          : proposal.afterValue}
                      </p>
                    </div>
                  </div>
                  {pending ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={mode !== "apply"}
                        onClick={() => onDecideProposal(proposal.id, "apply")}
                      >
                        {labels.applyEdit}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onDecideProposal(proposal.id, "reject")}
                      >
                        {labels.rejectEdit}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-label text-fg-muted mt-2" role="status">
                      {statusLabel}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {proposalError ? (
            <p role="alert" className="text-body text-danger mt-2">
              {labels.editStatusError}
            </p>
          ) : null}
        </section>
      ) : null}
      {reply.answer.limitations.length ? (
        <section>
          <h3 className="text-label text-fg-primary font-semibold">{labels.limitations}</h3>
          <ul className="text-label text-fg-secondary mt-1 list-inside list-disc">
            {reply.answer.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {reply.evidence.length ? (
        <details className="border-border text-label text-fg-muted rounded-[var(--radius-control)] border px-3 py-2">
          <summary className="text-fg-secondary cursor-pointer font-semibold">
            {labels.evidence} ({reply.evidence.length})
          </summary>
          {reply.evidence.map((item) => (
            <div
              id={`assistant-evidence-${encodeURIComponent(item.id)}`}
              key={item.id}
              className="mt-3 scroll-mt-4"
            >
              <p>
                {labels.source}: {item.source} · {item.period} · {item.itemCount} {labels.itemCount}
              </p>
              {item.version ? <p>{item.version}</p> : null}
              <p>
                {labels.capturedAt}:{" "}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  numberingSystem: "latn",
                }).format(new Date(item.retrievedAt))}
              </p>
              <p>{item.completeness === "bounded" ? labels.boundedData : labels.completeData}</p>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function formatPlanMonth(month: string, locale: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(date);
}

function formatProposalDate(value: string, locale: string, workspaceTimezone: string) {
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: workspaceTimezone,
  }).format(new Date(dateValue));
}
