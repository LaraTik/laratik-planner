"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, Link2, PlugZap, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import {
  setProviderConfigAction,
  removeProviderConfigAction,
  testProviderConfigAction,
  type ProviderConfigFormState,
} from "./actions";

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
  lastTestedAt: Date | null;
  lastTestedOk: boolean | null;
  lastTestErrorCode: string | null;
  configuredBy: string;
  updatedAt: Date;
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
      setState({ error: "App id and app secret are required." });
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
        `Remove the ${meta.label} provider config? Existing OAuth connections keep working until each workspace disconnects them.`,
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
                Enabled
              </>
            ) : (
              "Disabled"
            )}
          </span>
        ) : (
          <span
            className="text-label text-fg-muted"
            data-testid={`provider-config-status-${provider}`}
          >
            Not configured
          </span>
        )}
      </header>
      <p className="text-label text-fg-muted mb-4">{meta.description}</p>

      {callbackUrl ? (
        <section
          className="border-border bg-surface-subtle mb-4 rounded-[var(--radius-control)] border p-3"
          data-testid={`provider-config-callback-${provider}`}
          aria-label="OAuth callback URL"
        >
          <div className="mb-2 flex items-center gap-1.5">
            <Link2 className="text-fg-muted h-3.5 w-3.5" aria-hidden={true} />
            <h4 className="text-label text-fg-primary font-semibold">OAuth callback URL</h4>
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
              aria-label="Copy callback URL"
              data-testid={`provider-config-callback-copy-${provider}`}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden={true} />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-label text-fg-muted mt-2">
            Paste this URL into the
            {provider === "meta"
              ? ' "Valid OAuth Redirect URIs" field in your Meta app'
              : ' "Redirect URL" field in your TikTok app'}
            . Each agency has their own URL — the state token keeps every flow isolated.
          </p>
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
            App secret {existing ? "(leave blank to keep current)" : ""}
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
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              className="text-fg-muted hover:text-fg-primary absolute inset-y-0 right-0 flex items-center px-3"
              aria-label={showSecret ? "Hide app secret" : "Show app secret"}
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="border-border text-primary focus-visible:ring-focus-ring h-4 w-4 rounded-[var(--radius-control)] border focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            data-testid={`provider-config-enabled-${provider}`}
          />
          <span className="text-body text-fg-primary">Enabled</span>
          <span className="text-label text-fg-muted">
            Disable to stop new OAuth flows without losing the secret.
          </span>
        </label>

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
            Saved.
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
            {pending ? "Saving…" : existing ? "Save changes" : "Save"}
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
              {testPending ? "Testing…" : "Test credentials"}
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
              {removePending ? "Removing…" : "Remove"}
            </Button>
          ) : null}
        </div>
        {existing?.lastTestedAt ? (
          <p
            className="text-label text-fg-muted"
            data-testid={`provider-config-test-provenance-${provider}`}
          >
            {existing.lastTestedOk
              ? `Verified ${formatRelativeDate(existing.lastTestedAt)}.`
              : `Last test failed${existing.lastTestErrorCode ? ` (${existing.lastTestErrorCode})` : ""} ${formatRelativeDate(existing.lastTestedAt)}.`}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
