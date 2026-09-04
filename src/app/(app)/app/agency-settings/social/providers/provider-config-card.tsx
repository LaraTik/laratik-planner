"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, ChevronDown, Copy, Eye, EyeOff, Link2, PlugZap, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import {
  setProviderConfigAction,
  removeProviderConfigAction,
  testProviderConfigAction,
  type ProviderConfigFormState,
} from "./actions";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

// Hydration-aware `window.location.origin` reader. Mirrors the
// pattern in `edit-agency-form.tsx` (browser-only value, server
// snapshot empty). The empty server snapshot is rendered on the
// first paint to keep server and client output in lockstep.
const subscribeToHydration = () => () => undefined;

type ExistingSummary = {
  appId: string;
  loginConfigId: string | null;
  graphApiVersion: string | null;
  enabled: boolean;
  publishingEnabled: boolean;
  appReviewStatus: "not_requested" | "pending" | "approved" | "rejected";
  businessVerificationStatus: "not_required" | "not_started" | "pending" | "verified" | "rejected";
  lastTestedAt: Date | null;
  lastTestedOk: boolean | null;
  lastTestErrorCode: string | null;
  configuredBy: string;
  updatedAt: Date;
};

type Translator = (key: string, params?: Record<string, string | number>) => string;

const EN_FALLBACK: Translator = (key, params) => {
  const lookup: Record<string, string> = {
    "agencyProviders.statusEnabled": "Enabled",
    "agencyProviders.statusDisabled": "Disabled",
    "agencyProviders.statusNotConfigured": "Not configured",
    "agencyProviders.callbackAria": "OAuth callback URL",
    "agencyProviders.callbackHeading": "OAuth callback URL",
    "agencyProviders.callbackCopyAria": "Copy callback URL",
    "agencyProviders.callbackCopied": "Copied",
    "agencyProviders.callbackCopy": "Copy",
    "agencyProviders.callbackPasteMeta":
      'Paste this URL into the "Valid OAuth Redirect URIs" field in your Meta app. Each agency has their own URL — the state token keeps every flow isolated.',
    "agencyProviders.callbackPasteTiktok":
      'Paste this URL into the "Redirect URL" field in your TikTok app. Each agency has their own URL — the state token keeps every flow isolated.',
    "agencyProviders.callbackHowtoSummary": "How to register this URL",
    "agencyProviders.appSecretKeepCurrent": "(leave blank to keep current)",
    "agencyProviders.appSecretRequiredError": "App id and app secret are required.",
    "agencyProviders.enabledLabel": "Enabled",
    "agencyProviders.enabledHelp": "Disable to stop new OAuth flows without losing the secret.",
    "agencyProviders.saved": "Saved.",
    "agencyProviders.saveChanges": "Save changes",
    "agencyProviders.save": "Save",
    "agencyProviders.savePending": "Saving…",
    "agencyProviders.test": "Test credentials",
    "agencyProviders.testPending": "Testing…",
    "agencyProviders.remove": "Remove",
    "agencyProviders.removePending": "Removing…",
    "agencyProviders.removeConfirmPrefix": "Remove the",
    "agencyProviders.removeConfirmSuffix":
      "provider config? Existing OAuth connections keep working until each workspace disconnects them.",
    "agencyProviders.hideAppSecret": "Hide app secret",
    "agencyProviders.showAppSecret": "Show app secret",
    "agencyProviders.metaStep1": "Sign in to {url} with this agency's developer account.",
    "agencyProviders.metaStep2":
      "My Apps → click the agency's app (the App ID shown on this card).",
    "agencyProviders.metaStep3": "Left sidebar → Facebook Login for Business → Configurations.",
    "agencyProviders.metaStep4":
      'Open the config whose ID matches the agency\'s "Login for Business config id" (shown above). If no config exists, create one first.',
    "agencyProviders.metaStep5":
      "Scroll to Valid OAuth Redirect URIs → paste the URL above → Save Changes.",
    "agencyProviders.tiktokStep1": "Sign in to {url} with this agency's developer account.",
    "agencyProviders.tiktokStep2": "Apps → click the agency's app.",
    "agencyProviders.tiktokStep3": "Login Kit → Settings.",
    "agencyProviders.tiktokStep4": "Add the URL above to Redirect URIs → Save.",
    "agencyProviders.metaAlsoRequiredPrefix": "Also required on Meta:",
    "agencyProviders.metaAlsoRequiredBody":
      "Settings → Basic — toggle ON Client OAuth Login and Web OAuth Login, and add {domain} to App Domains. Without App Domains, Meta rejects the redirect even with the URI allowlisted.",
    "agencyProviders.perAgencyNote":
      "Each agency does this once for their own app. The URL is unique per agency because each agency owns their own Meta/TikTok app — a global callback would mix tenants and force every agency to share one app, which neither provider allows.",
    "agencyProviders.verifiedAt": "Verified {date}.",
    "agencyProviders.lastFailedSuffix": "Last test failed",
    "agencyProviders.lastFailedWithCode": "Last test failed ({code})",
  };
  let v = lookup[key] ?? key;
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      v = v.replaceAll(`{${k}}`, String(val));
    }
  }
  return v;
};

const PROVIDER_META = {
  meta: {
    label: "Meta (Facebook + Instagram)",
    description:
      "Used by the Facebook Login for Business OAuth flow. Requires an app id, an app secret, and a Login for Business config id.",
    appIdLabel: "Meta app id",
    appIdPlaceholder: "1234567890",
    loginConfigIdLabel: "Login for Business config id",
    loginConfigIdPlaceholder: "1234567890",
    graphApiVersionLabel: "Graph API version (optional)",
    graphApiVersionPlaceholder: "v25.0",
  },
  tiktok: {
    label: "TikTok (Display API)",
    description:
      "Used by the TikTok Display API OAuth flow. Requires a client key and client secret. Login Kit config id is not used.",
    appIdLabel: "TikTok client key",
    appIdPlaceholder: "aw1234567890",
    loginConfigIdLabel: "Login Kit config id (optional)",
    loginConfigIdPlaceholder: "",
    graphApiVersionLabel: "Display API version (optional)",
    graphApiVersionPlaceholder: "",
  },
} as const;

export function ProviderConfigCard({
  provider,
  agencyId,
  agencySlug,
  actorId,
  existing,
}: {
  provider: "meta" | "tiktok";
  agencyId: string;
  agencySlug: string;
  actorId: string;
  existing: ExistingSummary | null;
}) {
  const tr: Translator = useLocaleT() ?? EN_FALLBACK;
  const locale = useLocaleCode();
  const meta = PROVIDER_META[provider];
  const [appId, setAppId] = useState(existing?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loginConfigId, setLoginConfigId] = useState(existing?.loginConfigId ?? "");
  const [graphApiVersion, setGraphApiVersion] = useState(existing?.graphApiVersion ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [pending, startTransition] = useTransition();
  const [testPending, startTest] = useTransition();
  const [removePending, startRemove] = useTransition();
  const [state, setState] = useState<ProviderConfigFormState>({});
  // The per-agency callback URL is what the admin pastes into
  // their Meta / TikTok developer console. We build it from the
  // browser's actual origin (no NEXT_PUBLIC_APP_URL drift in
  // preview deploys) and the agency slug, computed during render
  // via useSyncExternalStore so the server snapshot stays empty
  // and the client first paints the empty string — no hydration
  // mismatch, no effect-driven setState cascade.
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const callbackUrl =
    isHydrated && /^[a-z0-9-]+$/.test(agencySlug)
      ? `${window.location.origin}/api/social/${provider}/callback/${agencySlug}`
      : "";
  const [copied, setCopied] = useState(false);
  async function copyCallbackUrl() {
    if (!callbackUrl) return;
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function save() {
    if (!appId || !appSecret) {
      setState({ error: tr("agencyProviders.appSecretRequiredError") });
      return;
    }
    setState({});
    startTransition(async () => {
      const result = await setProviderConfigAction(agencyId, actorId, provider, {
        appId: appId.trim(),
        appSecret,
        loginConfigId: loginConfigId.trim() || null,
        graphApiVersion: graphApiVersion.trim() || null,
        enabled,
      });
      setState(result);
      if ("success" in result) setAppSecret("");
    });
  }

  function test() {
    setState({});
    startTest(async () => {
      const result = await testProviderConfigAction(agencyId, provider);
      setState(result);
    });
  }

  function remove() {
    if (!existing) return;
    if (
      !confirm(
        `${tr("agencyProviders.removeConfirmPrefix")} ${meta.label} ${tr("agencyProviders.removeConfirmSuffix")}`,
      )
    ) {
      return;
    }
    setState({});
    startRemove(async () => {
      const result = await removeProviderConfigAction(agencyId, provider);
      if ("success" in result) {
        setAppId("");
        setAppSecret("");
        setLoginConfigId("");
        setGraphApiVersion("");
        setEnabled(true);
      }
      setState(result);
    });
  }

  return (
    <Card padding="md" data-testid={`provider-config-card-${provider}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-body text-fg-primary font-semibold">{meta.label}</h3>
        {existing ? (
          <span
            className="text-label text-fg-muted inline-flex items-center gap-1"
            data-testid={`provider-config-status-${provider}`}
          >
            {enabled ? (
              <>
                <Check className="text-success h-3 w-3" aria-hidden={true} />
                {tr("agencyProviders.statusEnabled")}
              </>
            ) : (
              tr("agencyProviders.statusDisabled")
            )}
          </span>
        ) : (
          <span
            className="text-label text-fg-muted"
            data-testid={`provider-config-status-${provider}`}
          >
            {tr("agencyProviders.statusNotConfigured")}
          </span>
        )}
      </header>
      <p className="text-label text-fg-muted mb-4">{meta.description}</p>

      {provider === "meta" ? (
        <section
          className="border-border bg-surface-subtle mb-4 space-y-2 rounded-[var(--radius-control)] border p-3"
          data-testid="meta-publishing-readiness"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-body text-fg-primary font-semibold">
              {tr("agencyProviders.publishingReadinessHeading")}
            </h4>
            <span className="text-label text-fg-muted inline-flex items-center gap-1">
              <PlugZap className="h-3.5 w-3.5" aria-hidden={true} />
              {existing?.publishingEnabled
                ? tr("agencyProviders.statusEnabled")
                : tr("agencyProviders.publishingDisabled")}
            </span>
          </div>
          <p className="text-label text-fg-secondary">
            {tr("agencyProviders.publishingReadinessBody")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <p className="text-label text-fg-muted">
              {tr("agencyProviders.publishingAppReview", {
                status: appReviewStatusLabel(existing?.appReviewStatus, tr),
              })}
            </p>
            <p className="text-label text-fg-muted">
              {tr("agencyProviders.publishingBusinessVerification", {
                status: businessVerificationStatusLabel(existing?.businessVerificationStatus, tr),
              })}
            </p>
          </div>
          <p className="text-label text-fg-muted">{tr("agencyProviders.publishingStatusHint")}</p>
        </section>
      ) : null}

      {callbackUrl ? (
        <section
          className="border-border bg-surface-subtle mb-4 rounded-[var(--radius-control)] border p-3"
          data-testid={`provider-config-callback-${provider}`}
          aria-label={tr("agencyProviders.callbackAria")}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <Link2 className="text-fg-muted h-3.5 w-3.5" aria-hidden={true} />
            <h4 className="text-label text-fg-primary font-semibold">
              {tr("agencyProviders.callbackHeading")}
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <code
              className="bg-surface text-body text-fg-primary border-border flex-1 overflow-x-auto rounded-[var(--radius-control)] border px-2.5 py-1.5 font-mono break-all"
              data-testid={`provider-config-callback-url-${provider}`}
            >
              {callbackUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyCallbackUrl}
              aria-label={tr("agencyProviders.callbackCopyAria")}
              data-testid={`provider-config-callback-copy-${provider}`}
            >
              <Copy className="me-1.5 h-3.5 w-3.5" aria-hidden={true} />
              {copied ? tr("agencyProviders.callbackCopied") : tr("agencyProviders.callbackCopy")}
            </Button>
          </div>
          <p className="text-label text-fg-muted mt-2">
            {tr(
              provider === "meta"
                ? "agencyProviders.callbackPasteMeta"
                : "agencyProviders.callbackPasteTiktok",
            )}
          </p>
          <details
            className="text-label text-fg-muted group mt-3"
            data-testid={`provider-config-callback-howto-${provider}`}
          >
            <summary className="text-fg-primary hover:text-primary inline-flex cursor-pointer list-none items-center gap-1 font-medium select-none [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                aria-hidden={true}
              />
              {tr("agencyProviders.callbackHowtoSummary")}
            </summary>
            <div className="border-border mt-2 space-y-3 border-t pt-3">
              {provider === "meta" ? (
                <ol className="list-decimal space-y-1.5 ps-5">
                  <li>
                    {tr("agencyProviders.metaStep1", {
                      url: "developers.facebook.com",
                    })}
                  </li>
                  <li>
                    <strong className="text-fg-primary font-medium">My Apps</strong> →{" "}
                    {tr("agencyProviders.metaStep2").replace(/^My Apps → /, "")}
                  </li>
                  <li>{tr("agencyProviders.metaStep3")}</li>
                  <li>{tr("agencyProviders.metaStep4")}</li>
                  <li>{tr("agencyProviders.metaStep5")}</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-1.5 ps-5">
                  <li>
                    {tr("agencyProviders.tiktokStep1", {
                      url: "developers.tiktok.com",
                    })}
                  </li>
                  <li>
                    <strong className="text-fg-primary font-medium">Apps</strong> →{" "}
                    {tr("agencyProviders.tiktokStep2").replace(/^Apps → /, "")}
                  </li>
                  <li>{tr("agencyProviders.tiktokStep3")}</li>
                  <li>{tr("agencyProviders.tiktokStep4")}</li>
                </ol>
              )}
              <p className="border-border bg-surface mt-2 rounded-[var(--radius-control)] border p-2">
                <strong className="text-fg-primary font-medium">
                  {tr("agencyProviders.metaAlsoRequiredPrefix")}
                </strong>{" "}
                {tr("agencyProviders.metaAlsoRequiredBody", { domain: "planner.laratik.com" })}
              </p>
              <p className="text-label text-fg-muted">{tr("agencyProviders.perAgencyNote")}</p>
            </div>
          </details>
        </section>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${provider}-app-id`}>{meta.appIdLabel}</Label>
          <Input
            id={`${provider}-app-id`}
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={meta.appIdPlaceholder}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${provider}-app-secret`}>
            App secret {existing ? tr("agencyProviders.appSecretKeepCurrent") : ""}
          </Label>
          <div className="relative">
            <Input
              id={`${provider}-app-secret`}
              type={showSecret ? "text" : "password"}
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
              required={!existing}
              className="pe-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              className="text-fg-muted hover:text-fg-primary absolute inset-y-0 end-0 flex items-center px-3"
              aria-label={
                showSecret
                  ? tr("agencyProviders.hideAppSecret")
                  : tr("agencyProviders.showAppSecret")
              }
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${provider}-login-config`}>{meta.loginConfigIdLabel}</Label>
          <Input
            id={`${provider}-login-config`}
            value={loginConfigId}
            onChange={(e) => setLoginConfigId(e.target.value)}
            placeholder={meta.loginConfigIdPlaceholder}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${provider}-graph-version`}>{meta.graphApiVersionLabel}</Label>
          <Input
            id={`${provider}-graph-version`}
            value={graphApiVersion}
            onChange={(e) => setGraphApiVersion(e.target.value)}
            placeholder={meta.graphApiVersionPlaceholder}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${provider}-enabled`}
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
            data-testid={`provider-config-enabled-${provider}`}
          />
          <label
            htmlFor={`${provider}-enabled`}
            className="text-body text-fg-primary cursor-pointer"
          >
            {tr("agencyProviders.enabledLabel")}
          </label>
          <span className="text-label text-fg-muted">{tr("agencyProviders.enabledHelp")}</span>
        </div>

        {state.error ? (
          <p
            role="alert"
            className="text-label text-danger"
            data-testid={`provider-config-error-${provider}`}
          >
            {state.error}
          </p>
        ) : null}
        {"success" in state && state.success ? (
          <p
            role="status"
            className="text-label text-fg-muted inline-flex items-center gap-1"
            data-testid={`provider-config-success-${provider}`}
          >
            <Check className="text-success h-3 w-3" aria-hidden={true} />
            {tr("agencyProviders.saved")}
          </p>
        ) : null}
        {state.testResult ? (
          <p
            role="status"
            className={`text-label inline-flex items-center gap-1 ${
              state.testResult.ok ? "text-fg-muted" : "text-danger"
            }`}
            data-testid={`provider-config-test-result-${provider}`}
          >
            {state.testResult.ok ? (
              <Check className="text-success h-3 w-3" aria-hidden={true} />
            ) : (
              <PlugZap className="h-3 w-3" aria-hidden={true} />
            )}
            {state.testResult.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={pending || testPending || removePending}
            aria-busy={pending}
            data-testid={`provider-config-save-${provider}`}
          >
            <Save className="h-4 w-4" aria-hidden={true} />
            {pending
              ? tr("agencyProviders.savePending")
              : existing
                ? tr("agencyProviders.saveChanges")
                : tr("agencyProviders.save")}
          </Button>
          {existing ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending || testPending || removePending}
              onClick={test}
              aria-busy={testPending}
              data-testid={`provider-config-test-${provider}`}
            >
              <PlugZap className="h-4 w-4" aria-hidden={true} />
              {testPending ? tr("agencyProviders.testPending") : tr("agencyProviders.test")}
            </Button>
          ) : null}
          {existing ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending || testPending || removePending}
              onClick={remove}
              aria-busy={removePending}
              data-testid={`provider-config-remove-${provider}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden={true} />
              {removePending ? tr("agencyProviders.removePending") : tr("agencyProviders.remove")}
            </Button>
          ) : null}
        </div>
        {existing?.lastTestedAt ? (
          <p
            className="text-label text-fg-muted"
            data-testid={`provider-config-test-provenance-${provider}`}
          >
            {existing.lastTestedOk
              ? tr("agencyProviders.verifiedAt", {
                  date: formatRelativeDate(existing.lastTestedAt, new Date(), locale),
                })
              : `${tr("agencyProviders.lastFailedWithCode", { code: existing.lastTestErrorCode ?? "—" })} ${formatRelativeDate(existing.lastTestedAt, new Date(), locale)}.`}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function appReviewStatusLabel(
  status: ExistingSummary["appReviewStatus"] | undefined,
  tr: Translator,
): string {
  switch (status) {
    case "pending":
      return tr("agencyProviders.publishingPending");
    case "approved":
      return tr("agencyProviders.publishingApproved");
    case "rejected":
      return tr("agencyProviders.publishingRejected");
    default:
      return tr("agencyProviders.publishingNotRequested");
  }
}

function businessVerificationStatusLabel(
  status: ExistingSummary["businessVerificationStatus"] | undefined,
  tr: Translator,
): string {
  switch (status) {
    case "verified":
      return tr("agencyProviders.businessVerified");
    case "not_required":
      return tr("agencyProviders.businessNotRequired");
    case "pending":
      return tr("agencyProviders.businessPending");
    case "rejected":
      return tr("agencyProviders.businessRejected");
    default:
      return tr("agencyProviders.businessNotRequired");
  }
}
