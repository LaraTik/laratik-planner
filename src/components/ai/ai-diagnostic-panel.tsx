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
  /** Server-resolved translator; omitted in isolated previews, which use English fallbacks. */
  t?: (key: string, params?: Record<string, string | number>) => string;
};

export function AiDiagnosticPanel(props: AiDiagnosticPanelProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    props.t ? props.t(key, params) : interpolate(fallback, params);
  const prereqs: ReadonlyArray<{
    id: "kill-switch" | "env-key" | "managed-secret";
    label: string;
    state: AiPrerequisiteState;
    detail: string;
    fix: string;
  }> = [
    {
      id: "kill-switch",
      label: tr("agencyAi.diagnostic.killSwitchLabel", "AI feature enabled in the deployment"),
      state: props.envKillSwitch ? "ok" : "off",
      detail: props.envKillSwitch
        ? tr("agencyAi.diagnostic.killSwitchSet", "Set in the deployment environment.")
        : tr(
            "agencyAi.diagnostic.killSwitchMissing",
            "Not set. The AI_FEATURE_ENABLED env var is the operator-level kill switch.",
          ),
      fix: tr(
        "agencyAi.diagnostic.killSwitchFix",
        "Set AI_FEATURE_ENABLED=true in the deployment .env and restart the container.",
      ),
    },
    {
      id: "env-key",
      label: tr("agencyAi.diagnostic.envKeyLabel", "Provider key in the deployment environment"),
      state: props.envHasKey ? "ok" : "missing",
      detail: props.envHasKey
        ? tr(
            "agencyAi.diagnostic.envKeySet",
            "MINIMAX_API_KEY is set. The key is never displayed after the initial paste.",
          )
        : tr("agencyAi.diagnostic.envKeyMissing", "MINIMAX_API_KEY is empty."),
      fix: tr(
        "agencyAi.diagnostic.envKeyFix",
        "Set MINIMAX_API_KEY=<your-key> in the deployment .env and restart the container.",
      ),
    },
    {
      id: "managed-secret",
      label: tr("agencyAi.diagnostic.managedSecretLabel", "Provider key stored for this agency"),
      state: props.hasManagedSecret ? "ok" : "missing",
      detail: props.hasManagedSecret
        ? tr("agencyAi.diagnostic.managedSecretSet", "Managed secret ends in …{suffix}", {
            suffix: props.managedSecretSuffix ?? "????",
          })
        : tr(
            "agencyAi.diagnostic.managedSecretMissing",
            "No managed secret. Add one in the form above to override the env key on a per-agency basis.",
          ),
      fix: tr(
        "agencyAi.diagnostic.managedSecretFix",
        "Paste your provider key in the form above. Only the last 4 characters are stored.",
      ),
    },
  ];

  return (
    <Card padding="md" data-testid="ai-diagnostic-panel" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="text-primary h-5 w-5" aria-hidden="true" />
        <CardTitle>{tr("agencyAi.diagnostic.title", "How AI works in this app")}</CardTitle>
        <Badge
          variant={props.effectiveLive ? "success" : "outline"}
          data-testid="ai-diagnostic-status"
        >
          {props.effectiveLive
            ? tr("agencyAi.diagnostic.live", "AI is live")
            : tr("agencyAi.diagnostic.off", "AI is off")}
        </Badge>
      </div>
      <CardDescription>
        {tr(
          "agencyAi.diagnostic.description",
          "AI is live when all three prerequisites are satisfied, the agency master switch is on, and at least one capability is enabled. Otherwise, in-app AI buttons stay disabled. A read-only status link next to each content-page section header shows planners where to look.",
        )}
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
                  <span className="font-semibold">
                    {tr("agencyAi.diagnostic.toFix", "To fix:")}
                  </span>{" "}
                  {p.fix}
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
          <p className="text-body text-fg-primary font-semibold">
            {tr("agencyAi.diagnostic.runtimeTitle", "Agency-side controls")}
          </p>
          <p className="text-label text-fg-secondary mt-0.5">
            {tr("agencyAi.diagnostic.masterSwitch", "Master switch:")}{" "}
            <strong>
              {props.masterSwitch
                ? tr("agencyAi.diagnostic.on", "On")
                : tr("agencyAi.diagnostic.offState", "Off")}
            </strong>
            {" \u00b7 "}
            {tr("agencyAi.diagnostic.capabilitiesEnabled", "Capabilities enabled:")}{" "}
            <strong>
              {props.anyCapabilityOn
                ? tr("agencyAi.diagnostic.yes", "Yes")
                : tr("agencyAi.diagnostic.none", "None")}
            </strong>
            {" \u00b7 "}
            {tr("agencyAi.diagnostic.effectiveRuntime", "Effective runtime:")}{" "}
            <strong data-testid="ai-diagnostic-effective">
              {props.effectiveLive
                ? tr("agencyAi.diagnostic.live", "Live")
                : tr("agencyAi.diagnostic.blocked", "Blocked")}
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
            <strong className="text-fg-primary">
              {tr("agencyAi.diagnostic.whereTitle", "Where AI features live.")}
            </strong>{" "}
            {tr(
              "agencyAi.diagnostic.whereBody",
              "On a content page (the planning detail screen), the AI assistance card sits next to the brief editor and offers 6 buttons: Generate campaign ideas, Improve brief, Draft caption, Adapt to platform, Related format ideas, and Check completeness. Each sends a 1-token-context prompt to the provider and returns a draft you can insert, replace, or copy.",
            )}
          </p>
          <p className="mt-2">
            <Link
              href={props.aiEntryHref}
              className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 py-0.5 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              data-testid="ai-diagnostic-where-link"
            >
              {tr("agencyAi.diagnostic.whereLink", "Open the AI section on a content page")}
            </Link>
          </p>
          <p className="text-label text-fg-muted mt-2" data-testid="ai-diagnostic-runbook-note">
            {tr(
              "agencyAi.diagnostic.runbookIntro",
              "For operator-level help (rotate the key, switch the model, drain a stuck queue) see",
            )}{" "}
            <code className="bg-surface rounded px-1.5 py-0.5 font-mono">
              docs/operations/ai-provider.md
            </code>{" "}
            {tr(
              "agencyAi.diagnostic.runbookSuffix",
              "in the repo. The docs/ directory is not served by the app, so this is a repo path, not a clickable URL.",
            )}
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
            <p className="font-semibold">
              {tr("agencyAi.diagnostic.blockedTitle", "AI is currently blocked")}
            </p>
            <p className="text-fg-secondary mt-1">
              {tr(
                "agencyAi.diagnostic.blockedBody",
                "The admin toggle in the database reads On, but the runtime is blocked because at least one prerequisite above is not met. Run buttons on the content detail page remain hidden until the block is lifted.",
              )}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function interpolate(value: string, params?: Record<string, string | number>): string {
  if (!params) return value;
  return Object.entries(params).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
    value,
  );
}
