"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Compass, Sparkles, LayoutGrid, FileText, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OnboardingWizard } from "./onboarding-wizard";
import { TrendFeed } from "./trend-feed";
import { SavedFilters } from "./saved-filters";
import { TrendsForYouTab } from "./for-you-tab";
import { TrendsBoardsTab } from "./boards-tab";
import { TrendsBriefsTab } from "./briefs-tab";
import { TrendSourceTosModal } from "@/components/ai/trend-source-tos-modal";
import { useLocaleT } from "@/components/i18n/locale-provider";
import type { SourceDefinition } from "@/lib/trends/source-catalog";

type TrendSignal = {
  id: string;
  sourceKey: string;
  platform: string;
  label: string;
  sourceUrl: string | null;
  velocity: number;
  lifecycle: string;
  score: number;
  vertical: string[];
  fetchedAt: string;
};

type SourceHealth = {
  sourceKey: string;
  circuitState: string;
  lastSuccessAt: string | null;
};

type Optout = {
  sourceKey: string;
  optedOutAt: string;
  reason: string | null;
};

/**
 * Top-level planner surface for the Trend Radar.
 *
 * Renders:
 *   - The degraded banner (if any open-circuit source).
 *   - The 4 tabs: Explore / For You / Boards / Briefs.
 *   - The first-run onboarding wizard (if no sources are enabled).
 *   - The trend feed (Explore tab default).
 *
 * The "Use in brief" CTA on each card opens the global QuickCreate
 * drawer (rendered globally in the workspace layout) and pre-fills
 * its topic field with the trend label. The drawer is a separate
 * surface; here we just dispatch a custom event the drawer picks up.
 */
export function TrendsPageClient({
  workspaceSlug,
  isAdmin,
  enabledKeys: _enabledKeys,
  health,
  optouts,
  signals,
  showOnboarding,
}: {
  workspaceSlug: string;
  isAdmin: boolean;
  enabledKeys: string[];
  health: SourceHealth[];
  optouts: Optout[];
  signals: TrendSignal[];
  showOnboarding: boolean;
}) {
  const t = useLocaleT();
  const [tab, setTab] = React.useState<"explore" | "for-you" | "boards" | "briefs">("explore");
  const [wizardOpen, setWizardOpen] = React.useState(showOnboarding);
  const [tosSource, setTosSource] = React.useState<SourceDefinition | null>(null);
  void _enabledKeys;

  // Sources whose circuit breaker is OPEN.
  const degraded = health.filter((h) => h.circuitState === "open");

  // Acknowledge a ToS-pending source before enabling (called from the
  // onboarding wizard when the user picks a grey-area source).
  const handleAcknowledgeTos = React.useCallback(async (source: SourceDefinition) => {
    setTosSource(source);
  }, []);

  // Quick-create dispatch — the global QuickCreate drawer listens for
  // `trends:use-in-brief` events and opens with the topic pre-filled.
  const handleUseInBrief = React.useCallback((trend: TrendSignal) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("trends:use-in-brief", {
          detail: { topic: trend.label, sourceKey: trend.sourceKey },
        }),
      );
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* Degraded banner — visible when any enabled source is OPEN. */}
      {degraded.length > 0 ? (
        <div
          data-testid="trends-degraded-banner"
          role="status"
          aria-live="polite"
          className="border-warning/30 bg-warning-subtle text-fg-primary flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertTriangle className="text-warning h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-title-card font-semibold">
              {t("trends.degraded.title") || "Some sources are temporarily unavailable"}
            </p>
            <p className="text-body text-fg-secondary text-sm">
              {t("trends.degraded.body", {
                sources: degraded.map((d) => d.sourceKey).join(", "),
              }) || `Showing fallback signals for: ${degraded.map((d) => d.sourceKey).join(", ")}.`}
            </p>
          </div>
          {isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/app/agency-settings/trend-sources">
                {t("trends.degraded.cta") || "View sources"}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="explore" data-testid="trends-tab-explore">
              <Compass className="h-4 w-4" aria-hidden="true" />
              {t("trends.tabs.explore") || "Explore"}
            </TabsTrigger>
            <TabsTrigger value="for-you" data-testid="trends-tab-for-you">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("trends.tabs.forYou") || "For you"}
            </TabsTrigger>
            <TabsTrigger value="boards" data-testid="trends-tab-boards">
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              {t("trends.tabs.boards") || "Boards"}
            </TabsTrigger>
            <TabsTrigger value="briefs" data-testid="trends-tab-briefs">
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t("trends.tabs.briefs") || "Briefs"}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <SavedFilters />
            {isAdmin ? (
              <Button asChild variant="outline" size="sm" data-testid="trends-sources-link">
                <Link href="/app/agency-settings/trend-sources">
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                  {t("trends.sourcesLink") || "Manage sources"}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <TabsContent value="explore" className="space-y-4">
          <TrendFeed
            workspaceSlug={workspaceSlug}
            signals={signals}
            optouts={optouts}
            onUseInBrief={handleUseInBrief}
            isEmpty={!showOnboarding && signals.length === 0}
          />
        </TabsContent>
        <TabsContent value="for-you">
          <TrendsForYouTab />
        </TabsContent>
        <TabsContent value="boards">
          <TrendsBoardsTab workspaceSlug={workspaceSlug} />
        </TabsContent>
        <TabsContent value="briefs">
          <TrendsBriefsTab workspaceSlug={workspaceSlug} />
        </TabsContent>
      </Tabs>

      {wizardOpen ? (
        <OnboardingWizard
          workspaceSlug={workspaceSlug}
          isAdmin={isAdmin}
          onClose={() => setWizardOpen(false)}
          onAcknowledgeTos={handleAcknowledgeTos}
        />
      ) : null}

      {tosSource ? (
        <TrendSourceTosModal
          open={Boolean(tosSource)}
          onOpenChange={(open) => {
            if (!open) setTosSource(null);
          }}
          sourceKey={tosSource.key}
          sourceLabel={tosSource.displayName}
          onAcknowledged={() => {
            setTosSource(null);
            setWizardOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
