import * as React from "react";
import Link from "next/link";
import { Sparkles, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * BrandKitHealth — a per-section coverage card that tells the
 * user (1) what this section contributes to the AI generation
 * route and (2) what they should consider adding next.
 *
 * Phase 7 ships the structural shell + the deterministic
 * "what feeds the AI" line; Phase 8 fills the `suggestions`
 * array with role-coverage logic (color palette missing
 * neutrals, typography missing headline, voice missing
 * 'don't' rules, etc.). Both phases share the same surface so
 * later changes are pure content, not layout.
 */
type Section = "logos" | "colors" | "typography" | "voice" | "pillars" | "publishing" | "linked";

const AI_CONTRIBUTION: Record<Section, string> = {
  logos: "Not currently fed to the AI. Visual brand-mark context for future image generation.",
  colors: "Not currently fed to the AI. Will be added in Phase 8 (color name + hex + role).",
  typography:
    "Not currently fed to the AI. Will be added in Phase 8 (font family + role + weight).",
  voice: "Fed to the AI as the brand voice — tone, do, and don't rules surface in caption drafts.",
  pillars:
    "Fed to the AI as content pillars. The model uses pillar names + blurbs to stay on-topic.",
  publishing: "Not currently fed to the AI. Will be added in Phase 8 (alt-text + hashtag norms).",
  linked: "Intentionally not fed to the AI. External links are for the human team only.",
};

const SECTION_LABEL: Record<Section, string> = {
  logos: "Logos",
  colors: "Colors",
  typography: "Typography",
  voice: "Voice & tone",
  pillars: "Pillars",
  publishing: "Publishing rules",
  linked: "Linked resources",
};

/**
 * Deterministic Phase 7 coverage + suggestion. The suggestion
 * copy is intentionally generic so the page renders something
 * useful in this round; Phase 8 will replace the static copy
 * with per-section role-coverage logic driven by the live
 * counts.
 */
function coverStatus(count: number): "empty" | "thin" | "ok" {
  if (count === 0) return "empty";
  if (count < 3) return "thin";
  return "ok";
}

const COVER_LABEL: Record<
  ReturnType<typeof coverStatus>,
  { label: string; icon: typeof CheckCircle2 }
> = {
  empty: { label: "Empty", icon: AlertCircle },
  thin: { label: "Getting started", icon: Info },
  ok: { label: "Healthy", icon: CheckCircle2 },
};

const COVER_CLASS: Record<ReturnType<typeof coverStatus>, string> = {
  empty: "text-danger",
  thin: "text-warning",
  ok: "text-success",
};

export interface BrandKitHealthProps {
  section: Section;
  slug: string;
  count: number;
}

export function BrandKitHealth({ section, slug, count }: BrandKitHealthProps) {
  const status = coverStatus(count);
  const { label: coverLabel, icon: CoverIcon } = COVER_LABEL[status];

  return (
    <Card
      padding="md"
      className="bg-surface-subtle"
      aria-label={`${SECTION_LABEL[section]} health`}
      data-testid={`brand-kit-health-${section}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
            <CardTitle className="text-base">Brand Kit Health</CardTitle>
            <span
              className={cn(
                "text-label inline-flex items-center gap-1 font-semibold",
                COVER_CLASS[status],
              )}
              data-testid={`brand-kit-health-${section}-status`}
            >
              <CoverIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {coverLabel}
            </span>
          </div>
          <p className="text-body text-fg-secondary">
            <span className="text-fg-primary font-semibold">{count}</span>{" "}
            {count === 1 ? "entry" : "entries"} in this section.
          </p>
          <p
            className="text-label text-fg-muted mt-1"
            data-testid={`brand-kit-health-${section}-ai-contribution`}
          >
            {AI_CONTRIBUTION[section]}
          </p>
        </div>
        <Link
          href={`/app/w/${slug}/brand-kit`}
          className="text-label text-primary inline-flex items-center gap-1 font-semibold hover:underline"
        >
          Brand Kit overview →
        </Link>
      </div>
    </Card>
  );
}
