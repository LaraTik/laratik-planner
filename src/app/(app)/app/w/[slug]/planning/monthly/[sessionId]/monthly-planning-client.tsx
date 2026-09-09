"use client";

import * as React from "react";
import { Check, FileOutput, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

type Message = { id: string; role: string; content: string };
type Proposal = { id: string; status: string; proposal: unknown } | null;

export function MonthlyPlanningClient({
  workspaceId,
  sessionId,
  initialStage,
  initialMessages,
  initialProposal,
}: {
  workspaceId: string;
  sessionId: string;
  initialStage: string;
  initialMessages: Message[];
  initialProposal: Proposal;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [messages, setMessages] = React.useState(initialMessages);
  const [proposal, setProposal] = React.useState(initialProposal);
  const [stage, setStage] = React.useState(initialStage);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const stages = ["discovery", "strategy", "execution", "review"] as const;
  const stageLabel = (value: string) => t(`monthlyPlanning.stage.${value}`);

  async function request(
    action: "message" | "generateProposal" | "approve" | "apply",
    message?: string,
  ) {
    setPending(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/ai/monthly-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          sessionId,
          action,
          ...(message ? { message } : {}),
          ...(proposal ? { proposalId: proposal.id } : {}),
        }),
        signal: controller.signal,
      });
      if (action === "message" && response.ok) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistant = "";
        let buffer = "";
        const consume = (chunk: string) => {
          buffer += chunk;
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const eventText of events) {
            const line = eventText.split("\n").find((candidate) => candidate.startsWith("data: "));
            if (!line) continue;
            try {
              const event = JSON.parse(line.slice(6)) as { chunk?: string };
              assistant += event.chunk ?? "";
            } catch {
              // Ignore an incomplete event; the buffer is retained for the next chunk.
            }
          }
        };
        if (reader) {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            consume(decoder.decode(next.value, { stream: true }));
          }
          consume(decoder.decode());
        }
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", content: assistant },
        ]);
      } else {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          proposal?: unknown;
          proposalId?: string;
        };
        if (response.status === 409) {
          setProposal((current) => (current ? { ...current, status: "stale" } : current));
          setError(t("monthlyPlanning.stale"));
          return;
        }
        if (!response.ok) throw new Error(body.error ?? t("monthlyPlanning.requestFailed"));
        if (action === "generateProposal" && body.proposal && body.proposalId) {
          setProposal({ id: body.proposalId, status: "draft", proposal: body.proposal });
          setStage("review");
        }
        if (action === "approve" && proposal) setProposal({ ...proposal, status: "approved" });
        if (action === "apply") setStage("applied");
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(
        requestError instanceof Error ? requestError.message : t("monthlyPlanning.requestFailed"),
      );
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  }

  function cancelRequest() {
    abortRef.current?.abort();
  }

  const plan = proposal?.proposal as {
    summary?: string;
    objective?: string;
    rows?: Array<{ title: string; format: string; brief: string }>;
    assumptions?: string[];
    missingInformation?: string[];
    risks?: string[];
    brandKitChanges?: Array<{ kind: string; title: string; content: string }>;
    qualitySummary?: { status: string; notes?: string[] };
  } | null;
  return (
    <div
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]"
      data-testid="monthly-planning-copilot"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{t("monthlyPlanning.copilotTitle")}</CardTitle>
                <CardDescription>{t("monthlyPlanning.copilotDescription")}</CardDescription>
              </div>
              <span className="bg-primary-subtle text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {stageLabel(stage)}
              </span>
            </div>
          </CardHeader>
          <div className="border-border grid gap-2 border-t p-4 sm:grid-cols-4">
            {stages.map((item) => (
              <div
                key={item}
                className={`rounded-[var(--radius-control)] border p-3 ${stage === item || (stage === "applied" && item === "review") ? "border-primary bg-primary-subtle" : "border-border"}`}
              >
                <span className="text-label block font-semibold">{stageLabel(item)}</span>
                <span className="text-label text-fg-muted">
                  {item === "discovery"
                    ? t("monthlyPlanning.discoveryHint")
                    : item === "strategy"
                      ? t("monthlyPlanning.strategyHint")
                      : item === "execution"
                        ? t("monthlyPlanning.executionHint")
                        : t("monthlyPlanning.reviewHint")}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="max-h-[48vh] space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.length ? (
              messages.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[var(--radius-control)] p-3 ${item.role === "user" ? "bg-primary text-primary-foreground ms-8" : "bg-surface-subtle me-8"}`}
                >
                  <p className="text-label mb-1 font-semibold">
                    {item.role === "user" ? t("monthlyPlanning.you") : t("monthlyPlanning.copilot")}
                  </p>
                  <p className="text-body whitespace-pre-wrap" dir="auto">
                    {item.content}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-body text-fg-muted">{t("monthlyPlanning.firstPrompt")}</p>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = draft.trim();
              if (!value || pending) return;
              setMessages((current) => [
                ...current,
                { id: crypto.randomUUID(), role: "user", content: value },
              ]);
              setDraft("");
              void request("message", value);
            }}
            className="border-border flex items-end gap-2 border-t p-4"
          >
            <DirAwareTextarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              locale={locale}
              rows={2}
              placeholder={t("monthlyPlanning.placeholder")}
              aria-label={t("monthlyPlanning.placeholder")}
            />
            {pending ? (
              <Button type="button" variant="secondary" onClick={cancelRequest}>
                {t("monthlyPlanning.cancel")}
              </Button>
            ) : (
              <Button type="submit" disabled={!draft.trim()} aria-busy={pending}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {t("monthlyPlanning.send")}
              </Button>
            )}
          </form>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("monthlyPlanning.proposalTitle")}</CardTitle>
            <CardDescription>{t("monthlyPlanning.proposalDescription")}</CardDescription>
          </CardHeader>
          <div className="space-y-3 p-4">
            {plan ? (
              <>
                <div className="bg-surface-subtle rounded p-3">
                  <p className="text-body font-semibold">{plan.objective}</p>
                  <p className="text-label text-fg-secondary mt-1">{plan.summary}</p>
                </div>
                <p className="text-label font-semibold">
                  {t("monthlyPlanning.rows", { count: plan.rows?.length ?? 0 })}
                </p>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {(plan.rows ?? []).map((row, index) => (
                    <div key={`${row.title}-${index}`} className="border-border rounded border p-3">
                      <p className="text-body font-semibold" dir="auto">
                        {row.title}
                      </p>
                      <p className="text-label text-fg-muted">
                        {row.format} · {row.brief}
                      </p>
                    </div>
                  ))}
                </div>
                {plan.brandKitChanges?.length ? (
                  <div className="border-warning bg-warning-subtle rounded-[var(--radius-control)] border p-3">
                    <p className="text-body font-semibold">
                      {t("monthlyPlanning.brandKitDiffTitle")}
                    </p>
                    <p className="text-label text-fg-secondary mt-1">
                      {t("monthlyPlanning.brandKitDiffDescription")}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {plan.brandKitChanges.map((change, index) => (
                        <li key={`${change.kind}-${index}`} className="text-label" dir="auto">
                          <strong>{change.title}</strong>: {change.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void request("generateProposal")}
                    disabled={pending}
                    aria-busy={pending}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    {t("monthlyPlanning.refreshProposal")}
                  </Button>
                  {proposal?.status === "draft" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void request("approve")}
                      disabled={pending}
                      aria-busy={pending}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {t("monthlyPlanning.approve")}
                    </Button>
                  ) : null}
                  {proposal?.status === "approved" ? (
                    <Button
                      type="button"
                      onClick={() => void request("apply")}
                      disabled={pending}
                      aria-busy={pending}
                    >
                      <FileOutput className="h-4 w-4" aria-hidden="true" />
                      {t("monthlyPlanning.apply")}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => void request("generateProposal")}
                disabled={pending}
                aria-busy={pending}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {t("monthlyPlanning.generateProposal")}
              </Button>
            )}
            {error ? (
              <p className="text-label text-danger font-semibold" role="alert">
                {error}
              </p>
            ) : null}
            {proposal?.status === "stale" ? (
              <p className="bg-warning-subtle text-body text-warning rounded p-3" role="status">
                {t("monthlyPlanning.stale")}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
