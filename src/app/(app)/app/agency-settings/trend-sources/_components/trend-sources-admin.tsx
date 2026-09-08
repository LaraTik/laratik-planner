"use client";

import * as React from "react";
import { Check, KeyRound, ShieldAlert, ShieldCheck, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { TREND_SOURCE_CATALOG, type SourceDefinition } from "@/lib/trends/source-catalog";

type SourceRow = {
  key: string;
  displayName: string;
  enabled: boolean;
  tier: "free" | "paid" | "experimental";
  tosClass: "clean" | "grey" | "review_required";
  cadence: string;
  tosAcknowledgedAt: string | null;
  hasApiKey: boolean;
};

type HealthRow = {
  sourceKey: string;
  circuitState: string;
  lastSuccessAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
};

/**
 * Agency-admin source catalog. Lists every catalog source, with
 * enable / disable / configure controls. The "configure" button
 * reveals the API-key input for paid sources.
 */
export function TrendSourcesAdmin({
  sources,
  health,
}: {
  sources: SourceRow[];
  health: HealthRow[];
}) {
  const t = useLocaleT();
  const [rows, setRows] = React.useState<SourceRow[]>(sources);
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [configOpen, setConfigOpen] = React.useState<string | null>(null);
  const [keyInput, setKeyInput] = React.useState("");

  const byKey = React.useMemo(() => {
    const m = new Map<string, SourceRow>();
    for (const r of rows) m.set(r.key, r);
    return m;
  }, [rows]);

  const healthByKey = React.useMemo(() => {
    const m = new Map<string, HealthRow>();
    for (const h of health) m.set(h.sourceKey, h);
    return m;
  }, [health]);

  const handleToggle = async (def: SourceDefinition) => {
    const current = byKey.get(def.key);
    const isEnabling = !current?.enabled;

    // Grey-area source requires ToS acknowledgement first.
    if (isEnabling && def.tosClass === "grey" && !current?.tosAcknowledgedAt) {
      const acked = await acknowledgeTos(def.key);
      if (!acked) {
        setErrors((prev) => ({
          ...prev,
          [def.key]: "tos_acknowledgement_required",
        }));
        return;
      }
    }

    setPending((p) => new Set(p).add(def.key));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[def.key];
      return next;
    });

    try {
      const res = await fetch(`/api/trends/sources/${def.key}/enable`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: isEnabling }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const errorCode = typeof payload?.error === "string" ? payload.error : "request_failed";
        setErrors((prev) => ({ ...prev, [def.key]: errorCode }));
        return;
      }
      setRows((prev) => {
        const next = [...prev];
        const idx = next.findIndex((r) => r.key === def.key);
        if (idx >= 0) {
          const existing = next[idx];
          if (!existing) return next;
          next[idx] = {
            key: def.key,
            displayName: def.displayName,
            tier: def.tier,
            tosClass: def.tosClass,
            cadence: def.cadence,
            enabled: isEnabling,
            tosAcknowledgedAt: existing.tosAcknowledgedAt ?? null,
            hasApiKey: existing.hasApiKey ?? false,
          };
        } else {
          next.push({
            key: def.key,
            displayName: def.displayName,
            enabled: isEnabling,
            tier: def.tier,
            tosClass: def.tosClass,
            cadence: def.cadence,
            tosAcknowledgedAt: def.tosClass === "grey" ? new Date().toISOString() : null,
            hasApiKey: false,
          });
        }
        return next;
      });
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(def.key);
        return next;
      });
    }
  };

  const handleSaveKey = async (def: SourceDefinition) => {
    if (!keyInput.trim()) return;
    setPending((p) => new Set(p).add(def.key));
    try {
      const res = await fetch(`/api/trends/sources/${def.key}/key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput }),
      });
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [def.key]: "key_save_failed" }));
        return;
      }
      setRows((prev) => prev.map((r) => (r.key === def.key ? { ...r, hasApiKey: true } : r)));
      setKeyInput("");
      setConfigOpen(null);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(def.key);
        return next;
      });
    }
  };

  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all" data-testid="admin-tab-all">
          {t("trends.admin.tabAll") || "All"} ({TREND_SOURCE_CATALOG.length})
        </TabsTrigger>
        <TabsTrigger value="enabled" data-testid="admin-tab-enabled">
          {t("trends.admin.tabEnabled") || "Enabled"} ({rows.filter((r) => r.enabled).length})
        </TabsTrigger>
        <TabsTrigger value="paid" data-testid="admin-tab-paid">
          {t("trends.admin.tabPaid") || "Paid"} (
          {TREND_SOURCE_CATALOG.filter((s) => s.tier === "paid").length})
        </TabsTrigger>
        <TabsTrigger value="grey" data-testid="admin-tab-grey">
          {t("trends.admin.tabGrey") || "Grey-area"} (
          {TREND_SOURCE_CATALOG.filter((s) => s.tosClass === "grey").length})
        </TabsTrigger>
      </TabsList>

      {["all", "enabled", "paid", "grey"].map((tab) => {
        const filtered = TREND_SOURCE_CATALOG.filter((def) => {
          if (tab === "enabled") return byKey.get(def.key)?.enabled === true;
          if (tab === "paid") return def.tier === "paid";
          if (tab === "grey") return def.tosClass === "grey";
          return true;
        });
        return (
          <TabsContent key={tab} value={tab} className="space-y-3">
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filtered.map((def) => {
                const row = byKey.get(def.key);
                const health = healthByKey.get(def.key);
                const isPending = pending.has(def.key);
                const error = errors[def.key];
                return (
                  <li
                    key={def.key}
                    data-testid={`source-card-${def.key}`}
                    className="border-border bg-surface-card flex flex-col gap-2 rounded-[var(--radius-card)] border p-4 shadow-xs transition-shadow duration-200 hover:shadow-md"
                  >
                    <header className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-title-card text-fg-primary font-semibold">
                          {def.displayName}
                        </p>
                        <p className="text-label text-fg-muted tracking-wide uppercase">
                          {def.tier} · {def.cadence} · {def.platform}
                        </p>
                      </div>
                      {def.tosClass === "grey" ? (
                        <span title="Grey-area source — ToS acknowledgement required">
                          <ShieldAlert
                            className="text-warning h-4 w-4"
                            aria-hidden="true"
                            data-testid="admin-source-tos"
                          />
                        </span>
                      ) : (
                        <ShieldCheck className="text-success h-4 w-4" aria-hidden="true" />
                      )}
                    </header>
                    <p className="text-body text-fg-secondary text-sm">{def.blurb}</p>

                    <div
                      className="text-label text-fg-muted flex items-center gap-2 text-xs"
                      data-testid={`source-status-${def.key}`}
                    >
                      {row?.enabled ? (
                        <span className="text-success flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("trends.admin.statusEnabled") || "Enabled"}
                        </span>
                      ) : (
                        <span className="text-fg-muted">
                          {t("trends.admin.statusDisabled") || "Disabled"}
                        </span>
                      )}
                      {health ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{health.circuitState}</span>
                        </>
                      ) : null}
                    </div>

                    {error ? (
                      <p
                        className="text-body text-danger"
                        data-testid="source-enable-error"
                        role="alert"
                      >
                        {t(`trends.admin.error.${error}`) || error}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={row?.enabled ? "outline" : "default"}
                        onClick={() => handleToggle(def)}
                        disabled={isPending}
                        data-testid={`admin-source-toggle-${def.key}`}
                      >
                        {row?.enabled
                          ? t("common.disable") || "Disable"
                          : t("common.enable") || "Enable"}
                      </Button>
                      {def.requiresApiKey ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfigOpen((k) => (k === def.key ? null : def.key))}
                          data-testid={`admin-source-configure-${def.key}`}
                        >
                          <Settings2 className="h-4 w-4" aria-hidden="true" />
                          {t("common.configure") || "Configure"}
                        </Button>
                      ) : null}
                      {row?.hasApiKey ? (
                        <span className="text-label text-success flex items-center gap-1 text-xs">
                          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("trends.admin.hasKey") || "Key set"}
                        </span>
                      ) : null}
                    </div>

                    {configOpen === def.key ? (
                      <div className="border-border bg-surface-subtle space-y-2 rounded-[var(--radius-control)] border p-3">
                        <Label htmlFor={`key-${def.key}`}>
                          {t("trends.admin.apiKeyLabel") || "API key"}
                        </Label>
                        <Input
                          id={`key-${def.key}`}
                          type="password"
                          data-testid={`source-config-${def.key}-key`}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder="••••••••"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSaveKey(def)}
                            disabled={!keyInput.trim() || isPending}
                          >
                            {t("common.save") || "Save"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setConfigOpen(null);
                              setKeyInput("");
                            }}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                            {t("common.cancel") || "Cancel"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

async function acknowledgeTos(sourceKey: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/trends/sources/${sourceKey}/acknowledge-tos`, {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}
