"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Copy, KeyRound, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { issueMcpTokenAction, revokeMcpTokenAction, type McpTokenActionState } from "./actions";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

const initialState: McpTokenActionState = {};

export function McpAccessTokensCard({ tokens }: { tokens: TokenRow[] }) {
  const t = useLocaleT();
  const [state, formAction] = useActionState(issueMcpTokenAction, initialState);
  const [copied, setCopied] = React.useState(false);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  async function copyToken() {
    if (!("issued" in state) || !state.issued) return;
    await navigator.clipboard.writeText(state.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function revoke(id: string) {
    if (!window.confirm(t("account.mcpConfirmRevoke"))) return;
    setRevoking(id);
    await revokeMcpTokenAction(id);
    setRevoking(null);
    window.location.reload();
  }

  return (
    <section aria-labelledby="mcp-access-heading" data-testid="mcp-access-card">
      <div className="mb-4 flex items-start gap-3">
        <KeyRound className="text-fg-secondary mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <h2 id="mcp-access-heading" className="text-heading-sm text-fg-primary font-semibold">
            {t("account.mcpTitle")}
          </h2>
          <p className="text-body text-fg-muted mt-1">{t("account.mcpDescription")}</p>
        </div>
      </div>

      {"errorCode" in state && state.errorCode ? (
        <div
          role="alert"
          className="border-danger/20 bg-danger-subtle text-danger mb-4 flex gap-2 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">{t(`account.errors.${state.errorCode}`)}</span>
        </div>
      ) : null}

      {"issued" in state && state.issued ? (
        <div
          className="border-success/20 bg-success-subtle mb-4 space-y-3 rounded-[var(--radius-control)] border p-3"
          role="status"
        >
          <div className="text-success flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-body">{t("account.mcpCreatedOnce")}</p>
          </div>
          <div className="flex items-center gap-2">
            <code
              className="bg-surface text-body text-fg-primary min-w-0 flex-1 overflow-x-auto rounded border px-2 py-2"
              dir="ltr"
            >
              {state.token}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copyToken}
              aria-label={t("account.mcpCopy")}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? t("account.mcpCopied") : t("account.mcpCopy")}
            </Button>
          </div>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4 border-b pb-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <label className="text-body text-fg-primary space-y-1 font-semibold">
            <span>{t("account.mcpNameLabel")}</span>
            <Input
              name="mcpTokenName"
              required
              maxLength={100}
              placeholder={t("account.mcpNamePlaceholder")}
            />
          </label>
          <label className="text-body text-fg-primary space-y-1 font-semibold">
            <span>{t("account.mcpDurationLabel")}</span>
            <select
              name="mcpTokenDuration"
              defaultValue="90"
              className="border-border bg-surface text-body text-fg-primary h-10 w-full rounded-[var(--radius-control)] border px-3"
            >
              <option value="30">{t("account.mcpDuration30")}</option>
              <option value="90">{t("account.mcpDuration90")}</option>
              <option value="365">{t("account.mcpDuration365")}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="text-body text-fg-primary flex min-h-11 items-center gap-2 font-semibold">
            <Checkbox name="mcpTokenScope" value="content:read" defaultChecked />
            {t("account.mcpReadScope")}
          </label>
          <label className="text-body text-fg-primary flex min-h-11 items-center gap-2 font-semibold">
            <Checkbox name="mcpTokenScope" value="content:write" />
            {t("account.mcpWriteScope")}
          </label>
        </div>
        <FormSubmitButton label={t("account.mcpCreate")} pendingLabel={t("account.mcpCreating")} />
      </form>

      <div className="mt-4 space-y-2">
        {tokens.length === 0 ? (
          <p className="text-body text-fg-muted">{t("account.mcpNoTokens")}</p>
        ) : null}
        {tokens.map((token) => (
          <div
            key={token.id}
            className="border-border flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-body text-fg-primary font-semibold">{token.name}</p>
              <p className="text-label text-fg-muted" dir="ltr">
                {token.tokenPrefix}… ·{" "}
                {t("account.mcpExpires", { date: new Date(token.expiresAt).toLocaleDateString() })}
              </p>
            </div>
            {token.revokedAt ? (
              <span className="text-label text-danger">{t("account.mcpRevoked")}</span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => revoke(token.id)}
                disabled={revoking === token.id}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t("account.mcpRevoke")}
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
