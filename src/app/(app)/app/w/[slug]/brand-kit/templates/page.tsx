import { notFound, redirect } from "next/navigation";
import { Tag, MessageCircle, Palette, Type, BookOpen } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { TemplateCard } from "../_components/template-card";
import {
  colorTemplates,
  pillarTemplates,
  publishingTemplates,
  typographyTemplates,
  voiceTemplates,
} from "@/lib/brand/templates";
import { fontClassFor } from "@/lib/brand/typography-families";

/**
 * /app/w/[slug]/brand-kit/templates — the curated template
 * library (Phase 8). One-click "Add to brand kit" cards for
 * voice rules, pillars, color palettes, font pairs, and
 * publishing rules. Every section on the brand kit has
 * matching templates here so a workspace can bootstrap a
 * complete voice / identity / editorial kit in under a minute
 * without writing any of the rules by hand.
 */
export default async function BrandKitTemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const canEdit = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);

  return (
    <div className="space-y-8">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        title={t("brandKit.templatesTitle")}
        description={t("brandKit.templatesDescription")}
      />

      <TemplateSection
        icon={MessageCircle}
        title="Voice"
        blurb="Tone, do, and don't rule seeds. The AI uses the voice rules you keep as the strongest signal in caption drafts."
        testId="template-section-voice"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {voiceTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              kind="voice"
              slug={slug}
              templateId={t.id}
              title={t.content}
              {...(t.blurb ? { blurb: t.blurb } : {})}
              preview={
                <span className="border-border bg-surface-subtle text-label rounded-full border px-2.5 py-0.5 font-bold tracking-wide uppercase">
                  {t.ruleType}
                </span>
              }
            />
          ))}
        </div>
      </TemplateSection>

      <TemplateSection
        icon={Tag}
        title="Pillars"
        blurb="Content pillar seeds to bootstrap the taxonomy. Each pillar carries a one-sentence description the AI uses to keep caption drafts on-topic."
        testId="template-section-pillars"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pillarTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              kind="pillar"
              slug={slug}
              templateId={t.id}
              title={t.name}
              blurb={t.description}
              preview={
                t.color ? (
                  <span
                    className="border-border h-5 w-5 rounded-full border"
                    style={{ backgroundColor: t.color }}
                    aria-hidden="true"
                  />
                ) : undefined
              }
            />
          ))}
        </div>
      </TemplateSection>

      <TemplateSection
        icon={Palette}
        title="Color palettes"
        blurb="Five-color starter palettes with role assignments. Each click adds every swatch that isn't already in your palette."
        testId="template-section-colors"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colorTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              kind="palette"
              slug={slug}
              templateId={t.id}
              title={t.name}
              blurb={t.blurb}
              preview={
                <>
                  {t.swatches.map((s) => (
                    <span
                      key={s.hex}
                      className="border-border h-6 w-6 rounded-full border"
                      style={{ backgroundColor: s.hex }}
                      title={`${s.name} (${s.hex})`}
                      aria-label={`${s.name} ${s.hex}`}
                    />
                  ))}
                </>
              }
              meta={`${t.swatches.length} swatches`}
            />
          ))}
        </div>
      </TemplateSection>

      <TemplateSection
        icon={Type}
        title="Typography pairs"
        blurb="Headline + body face pairings. Each click adds every face in the pair that isn't already catalogued."
        testId="template-section-typography"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {typographyTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              kind="typography"
              slug={slug}
              templateId={t.id}
              title={t.name}
              blurb={t.blurb}
              preview={
                <>
                  {t.faces.map((f) => (
                    <span
                      key={f.family}
                      className={cn(
                        "border-border bg-surface-subtle text-label rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold",
                        fontClassFor(f.family) ?? "",
                      )}
                    >
                      {f.family}
                    </span>
                  ))}
                </>
              }
              meta={`${t.faces.length} face${t.faces.length === 1 ? "" : "s"}`}
            />
          ))}
        </div>
      </TemplateSection>

      <TemplateSection
        icon={BookOpen}
        title="Publishing rules"
        blurb="Editorial guardrails for the team. Each click adds the rule to your publishing rules list."
        testId="template-section-publishing"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {publishingTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              kind="publishing"
              slug={slug}
              templateId={t.id}
              title={t.title}
              blurb={t.content}
              preview={
                <span className="border-border bg-surface-subtle text-label rounded-full border px-2.5 py-0.5 font-bold tracking-wide uppercase">
                  {t.ruleType.replace("_", " ")}
                </span>
              }
            />
          ))}
        </div>
      </TemplateSection>

      {!canManage ? (
        <p className="text-label text-fg-muted text-center" role="status">
          You need workspace-manager access to add templates.{" "}
          {canEdit ? "Ask a manager to apply these." : ""}
        </p>
      ) : null}
    </div>
  );
}

function TemplateSection({
  icon: Icon,
  title,
  blurb,
  testId,
  children,
}: {
  icon: typeof Tag;
  title: string;
  blurb: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6"
      aria-labelledby={`${testId}-heading`}
      data-testid={testId}
    >
      <header className="mb-4 flex items-start gap-3">
        <span
          className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 id={`${testId}-heading`} className="text-section-title text-fg-primary font-semibold">
            {title}
          </h2>
          <p className="text-body text-fg-secondary">{blurb}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
