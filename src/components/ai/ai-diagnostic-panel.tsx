import { AlertTriangle, Check, CircleDashed, ShieldCheck, ToggleRight, Wrench } from "lucide-react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * `AiDiagnosticPanel` — the single place admins can read to
 * answer "why is AI off?" (or "how do I turn it on?").
 *
 * Why this exists
 * ───────────────
 * Before this panel, the AI admin page had three places that
 * independently reported the state (`Provider environment` badge,
 * `Feature settings` master switch, `Provider key` card) and the
 * off-state banner on the content detail page just said "An agency
 * admin needs to enable the AI master switch" — which is true in
 * some cases and wrong in others. Admins had to mentally cross-
 * reference four badges to understand why their "Run" button was
 * disabled.
 *
 * This panel lists the 3 prerequisites for AI to be live, the
 * current state of each, and a one-line "fix" for any unmet
 * prerequisite. It also links to the operator runbook so a
 * non-engineer admin can hand it to the operator.
 *
 * It is intentionally a server component (no `"use client"`) so
 * the data is read from the same place the rest of the page reads
 * from and there's no risk of the panel drifting out of sync with
 * the page header. The component is also pure (props in, JSX out)
 * so it can be unit-tested in plain Node.
 */

export type AiPrerequisiteState = "ok" | "missing" | "off";

export type AiDiagnosticPanelProps = {
  /** Whether `AI_FEATURE_ENABLED=true` in the deployment env. */
  envKillSwitch: boolean;
  /** Whether `MINIMAX_API_KEY` is set in the deployment env. */
  envHasKey: boolean;
  /** Whether the agency has a stored (managed) AI provider key. */
  hasManagedSecret: boolean;
  /** Last 4 chars of the managed secret, if any. */
  managedSecretSuffix: string | null;
  /** Whether the agency admin has turned the master switch on. */
  masterSwitch: boolean;
  /** Whether the agency admin has any capability toggled on. */
  anyCapabilityOn: boolean;
  /** Whether the AI route will accept a request right now. */
  effectiveLive: boolean;
  /** Where the AI features live in the product (so admins can link planners). */
  aiEntryHref: string;
};

export function AiDiagnosticPanel(props: AiDiagnosticPanelProps) {
  const prereqs: ReadonlyArray<{
    id: "kill-switch" | "env-key" | "managed-secret";
    label: string;
    state: AiPrerequisiteState;
    detail: string;
    fix: string;
  }> = [
    {
      id: "kill-switch",
      label: "AI feature enabled in the deployment",
      state: props.envKillSwitch ? "ok" : "off",
      detail: props.envKillSwitch
        ? "Set in the deployment environment."
        : "Not set. The `AI_FEATURE_ENABLED` env var is the operator-level kill switch.",
      fix: "Set `AI_FEATURE_ENABLED=true` in the deployment `.env` and restart the container.",
    },
    {
      id: "env-key",
      label: "Provider key in the deployment environment",
      state: props.envHasKey ? "ok" : "missing",
      detail: props.envHasKey
        ? "`MINIMAX_API_KEY` is set. The key is never displayed after the initial paste."
        : "`MINIMAX_API_KEY` is empty.",
      fix: "Set `MINIMAX_API_KEY=<your-key>` in the deployment `.env` and restart the container.",
    },
    {
      id: "managed-secret",
      label: "Provider key stored for this agency",
      state: props.hasManagedSecret ? "ok" : "missing",
      detail: props.hasManagedSecret
        ? `Managed secret ends in \u2026${props.managedSecretSuffix ?? "????"}`
        : "No managed secret. Add one in the form above to override the env key on a per-agency basis.",
      fix: "Paste your provider key in the form above. Only the last 4 characters are stored.",
    },
  ];

  return (
    <Card padding="md" data-testid="ai-diagnostic-panel" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="text-primary h-5 w-5" aria-hidden="true" />
        <CardTitle>How AI works in this app</CardTitle>
        <Badge
          variant={props.effectiveLive ? "success" : "outline"}
          data-testid="ai-diagnostic-status"
        >
          {props.effectiveLive ? "AI is live" : "AI is off"}
        </Badge>
      </div>
      <CardDescription>
        AI is live when all three prerequisites are satisfied AND the agency master switch is on AND
        at least one capability is enabled. Anything below that, and the in-app AI buttons stay
        disabled (with a Status (read-only) link next to the section header on each content page so
        the planner knows where to look).
      </CardDescription>

      <ol className="space-y-2" data-testid="ai-diagnostic-prerequisites">
        {prereqs.map((p, i) => (
          <li
            key={p.id}
            className={[
              "border-border flex flex-wrap items-start gap-3 rounded-[var(--radius-control)] border p-3",
              p.state === "ok" ? "bg-success-soft" : "bg-warning-soft",
            ].join(" ")}
            data-testid={`ai-prereq-${p.id}`}
          >
            <span
              className={[
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                p.state === "ok" ? "bg-success text-white" : "bg-warning text-fg-primary",
              ].join(" ")}
              aria-hidden="true"
            >
              {p.state === "ok" ? (
                <Check className="h-4 w-4" />
              ) : (
                <CircleDashed className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-body text-fg-primary font-semibold"
                data-testid={`ai-prereq-${p.id}-label`}
              >
                {i + 1}. {p.label}
              </p>
              <p
                className="text-label text-fg-secondary mt-0.5"
                data-testid={`ai-prereq-${p.id}-detail`}
              >
                {p.detail}
              </p>
              {p.state !== "ok" ? (
                <p className="text-label text-fg-muted mt-1" data-testid={`ai-prereq-${p.id}-fix`}>
                  <span className="font-semibold">To fix:</span> {p.fix}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div
        className="border-border flex flex-wrap items-start gap-3 rounded-[var(--radius-control)] border p-3"
        data-testid="ai-diagnostic-runtime"
      >
        <span
          className="bg-surface-subtle mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <ToggleRight className="text-fg-secondary h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body text-fg-primary font-semibold">Agency-side controls</p>
          <p className="text-label text-fg-secondary mt-0.5">
            Master switch: <strong>{props.masterSwitch ? "On" : "Off"}</strong>
            {" \u00b7 "}
            Capabilities enabled: <strong>{props.anyCapabilityOn ? "Yes" : "None"}</strong>
            {" \u00b7 "}
            Effective runtime:{" "}
            <strong data-testid="ai-diagnostic-effective">
              {props.effectiveLive ? "Live" : "Blocked"}
            </strong>
          </p>
        </div>
      </div>

      <div
        className="border-border bg-surface-subtle flex flex-wrap items-start gap-3 rounded-[var(--radius-control)] border p-3"
        data-testid="ai-diagnostic-where"
      >
        <ShieldCheck className="text-fg-secondary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="text-body text-fg-secondary min-w-0 flex-1">
          <p>
            <strong className="text-fg-primary">Where AI features live.</strong> On a content page
            (the planning detail screen), the AI assistance card sits next to the brief editor and
            offers 6 buttons: Generate campaign ideas, Improve brief, Draft caption, Adapt to
            platform, Related format ideas, Check completeness. Each one sends a 1-token-context
            prompt to the provider and returns a draft you can insert, replace, or copy.
          </p>
          <p className="mt-2">
            <Link
              href={props.aiEntryHref}
              className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 py-0.5 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              data-testid="ai-diagnostic-where-link"
            >
              Open the AI section on a content page
            </Link>
          </p>
          <p className="text-label text-fg-muted mt-2" data-testid="ai-diagnostic-runbook-note">
            For operator-level help (rotate the key, switch the model, drain a stuck queue) see{" "}
            <code className="bg-surface rounded px-1.5 py-0.5 font-mono">
              docs/operations/ai-provider.md
            </code>{" "}
            in the repo. The <code>docs/</code> directory is not served by the app, so this is a
            repo-link, not a clickable URL from here.
          </p>
        </div>
      </div>

      {!props.effectiveLive ? (
        <div
          className="border-border bg-warning-soft flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
          role="status"
          data-testid="ai-diagnostic-blocked-banner"
        >
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="text-body text-fg-primary min-w-0 flex-1">
            <p className="font-semibold">AI is currently blocked</p>
            <p className="text-fg-secondary mt-1">
              The admin toggle in the database reads <strong>On</strong> but the runtime is blocked
              because at least one prerequisite above is not met. The Run buttons in the content
              detail page are hidden until the block is lifted.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
