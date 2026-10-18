"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, PlayCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_TEST_LAB_CHANNELS } from "@/lib/community/ai-test-lab";

type Copy = {
  title: string;
  description: string;
  channel: string;
  message: string;
  scenario: string;
  scenarioHint: string;
  messagePlaceholder: string;
  scenarioPlaceholder: string;
  run: string;
  running: string;
  result: string;
  draft: string;
  decision: string;
  explanation: string;
  safety: string;
  noProviderGuarantee: string;
  inputRequired: string;
  providerUnavailable: string;
  blocked: string;
  needsReview: string;
  draftDecision: string;
  escalateDecision: string;
  safe: string;
  review: string;
  safetyBlocked: string;
  noResult: string;
  channelFacebookComments: string;
  channelFacebookPrivateMessages: string;
  channelInstagramComments: string;
  channelInstagramPrivateMessages: string;
};

type Props = {
  agencySlug: string;
  workspaceSlug: string;
  copy: Copy;
};

type Result = {
  draft: string;
  decision: "draft" | "escalate" | "block";
  explanation: string[];
  safetyStatus: "safe" | "review" | "blocked";
};

const initialChannel = COMMUNITY_TEST_LAB_CHANNELS[0];

export function CommunityTestLab({ agencySlug, workspaceSlug, copy }: Props) {
  const [channel, setChannel] =
    useState<(typeof COMMUNITY_TEST_LAB_CHANNELS)[number]>(initialChannel);
  const [message, setMessage] = useState("");
  const [scenario, setScenario] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const channelLabels: Record<(typeof COMMUNITY_TEST_LAB_CHANNELS)[number], string> = {
    facebook_comments: copy.channelFacebookComments,
    facebook_private_messages: copy.channelFacebookPrivateMessages,
    instagram_comments: copy.channelInstagramComments,
    instagram_private_messages: copy.channelInstagramPrivateMessages,
  };

  async function runSimulation() {
    if (!message.trim()) {
      setError(copy.inputRequired);
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/community/test-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agencySlug, workspaceSlug, channel, message, scenario }),
      });
      const payload = (await response.json().catch(() => null)) as {
        result?: Result;
        error?: string;
      } | null;
      if (!response.ok || !payload?.result) {
        setError(
          payload?.error === "ai_provider_not_configured" ? copy.providerUnavailable : copy.review,
        );
        return;
      }
      setResult(payload.result);
    } catch {
      setError(copy.review);
    } finally {
      setRunning(false);
    }
  }

  const decisionLabel =
    result?.decision === "draft"
      ? copy.draftDecision
      : result?.decision === "escalate"
        ? copy.escalateDecision
        : copy.blocked;
  const safetyLabel =
    result?.safetyStatus === "safe"
      ? copy.safe
      : result?.safetyStatus === "review"
        ? copy.needsReview
        : copy.safetyBlocked;

  return (
    <div className="grid gap-4 xl:grid-cols-2" data-testid="community-test-lab">
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <div className="space-y-4">
          <div className="border-primary/20 bg-primary-subtle flex items-start gap-3 rounded-[var(--radius-control)] border p-4">
            <ShieldCheck className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-label text-fg-secondary">{copy.noProviderGuarantee}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-test-lab-channel">{copy.channel}</Label>
            <select
              id="community-test-lab-channel"
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as (typeof COMMUNITY_TEST_LAB_CHANNELS)[number])
              }
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring h-11 w-full rounded-[var(--radius-control)] border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              {COMMUNITY_TEST_LAB_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {channelLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-test-lab-message">{copy.message}</Label>
            <Textarea
              id="community-test-lab-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={copy.messagePlaceholder}
              maxLength={4000}
              rows={6}
              aria-describedby="community-test-lab-message-count"
            />
            <p id="community-test-lab-message-count" className="text-label text-fg-muted text-end">
              {message.length}/4000
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-test-lab-scenario">{copy.scenario}</Label>
            <Textarea
              id="community-test-lab-scenario"
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              placeholder={copy.scenarioPlaceholder}
              maxLength={1000}
              rows={3}
              aria-describedby="community-test-lab-scenario-help"
            />
            <p id="community-test-lab-scenario-help" className="text-label text-fg-muted">
              {copy.scenarioHint}
            </p>
          </div>
          {error ? (
            <p className="text-label text-danger flex items-center gap-2" role="alert">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            onClick={runSimulation}
            disabled={running || !message.trim()}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {running ? copy.running : copy.run}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{copy.result}</CardTitle>
          <CardDescription>{copy.noProviderGuarantee}</CardDescription>
        </CardHeader>
        {result ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={result.decision === "block" ? "danger" : "info"}>
                {copy.decision}: {decisionLabel}
              </Badge>
              <Badge variant={result.safetyStatus === "safe" ? "success" : "warning"}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.safety}: {safetyLabel}
              </Badge>
            </div>
            <div className="bg-surface-subtle rounded-[var(--radius-control)] p-4">
              <p className="text-label text-fg-muted">{copy.draft}</p>
              <p className="text-body text-fg-primary mt-2 whitespace-pre-wrap">
                {result.draft || copy.noResult}
              </p>
            </div>
            <div>
              <p className="text-label text-fg-muted">{copy.explanation}</p>
              <ul className="text-label text-fg-secondary mt-2 list-disc space-y-1 ps-5">
                {result.explanation.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="border-primary/20 bg-primary-subtle rounded-[var(--radius-control)] border p-4">
            <p className="text-label text-fg-secondary">{copy.noProviderGuarantee}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
