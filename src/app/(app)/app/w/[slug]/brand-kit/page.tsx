import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Clock, Palette, Type } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";

/**
 * Brand kit (Goal 4 master prompt §3) — workspace-scoped reference
 * for visual assets and writing guidance.
 *
 * The Stitch design (project 5403097764334458790, screen 16aaf0a9)
 * ships 8 sections: Logo Assets, Color Palette, Typography,
 * Voice & Tone, Content Pillars, Publishing Rules, Linked Resources,
 * Recent Updates. v1 stores assets (logo, color, font, other) and
 * voice rules in Postgres; the page renders them with section
 * anchors + cards. New sections (typography fonts, color swatches,
 * content pillars) can be added as M3.x follow-ups without changing
 * the page structure.
 */
export default async function BrandKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const [assets, rules] = await Promise.all([
    db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.workspaceId, workspace.id), isNull(brandAssets.archivedAt))),
    db.select().from(brandVoiceRules).where(eq(brandVoiceRules.workspaceId, workspace.id)),
  ]);

  // Group assets by kind so the "Logo Assets" / "Color Palette" /
  // "Typography" sections can be populated from a single table.
  const assetsByKind = {
    logo: assets.filter((a) => a.kind === "logo"),
    color: assets.filter((a) => a.kind === "color"),
    font: assets.filter((a) => a.kind === "font"),
    other: assets.filter((a) => a.kind === "other"),
  } as const;

  const sections: { id: string; label: string; count: number }[] = [
    { id: "logo", label: "Logo Assets", count: assetsByKind.logo.length },
    { id: "color", label: "Color Palette", count: assetsByKind.color.length },
    { id: "typography", label: "Typography", count: assetsByKind.font.length },
    { id: "voice", label: "Voice & Tone", count: rules.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Brand kit"
        description={
          <>
            The shared source for visual assets and writing guidance.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Brand kit sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  data-testid={`brand-kit-nav-${section.id}`}
                  className="text-body text-fg-secondary hover:bg-surface-subtle hover:text-fg-primary flex items-center justify-between rounded-[var(--radius-control)] px-3 py-2 font-semibold transition-colors"
                >
                  <span>{section.label}</span>
                  <span className="text-label text-fg-muted">{section.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          <Card id="logo">
            <CardTitle className="mb-3 inline-flex items-center gap-2">
              <Palette className="text-fg-secondary h-4 w-4" aria-hidden="true" />
              Logo Assets
            </CardTitle>
            {assetsByKind.logo.length ? (
              <ul className="divide-border divide-y">
                {assetsByKind.logo.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex items-center justify-between py-3"
                    data-testid={`brand-asset-${asset.id}`}
                  >
                    <span className="text-body font-semibold">{asset.name}</span>
                    <Badge>logo</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-fg-muted py-4">No logo assets yet.</p>
            )}
          </Card>

          <Card id="color">
            <CardTitle className="mb-3">Color Palette</CardTitle>
            {assetsByKind.color.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {assetsByKind.color.map((asset) => {
                  // The hex lives in the jsonb `value` column. Older
                  // rows may have it under different keys; we try a
                  // few candidates and fall back to a neutral swatch.
                  const v = (asset.value ?? {}) as Record<string, unknown>;
                  const hex =
                    (typeof v.hex === "string" && v.hex) ||
                    (typeof v.color === "string" && v.color) ||
                    (typeof v.value === "string" && v.value) ||
                    "#e5e7eb";
                  return (
                    <li
                      key={asset.id}
                      className="border-border bg-surface-subtle flex items-center gap-3 rounded-[var(--radius-control)] border p-3"
                    >
                      <span
                        className="border-border h-10 w-10 shrink-0 rounded border"
                        style={{ backgroundColor: hex }}
                        aria-hidden="true"
                      />
                      <span className="text-body text-fg-primary truncate font-semibold">
                        {asset.name}
                      </span>
                      <span className="text-label text-fg-muted ml-auto font-mono">{hex}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-body text-fg-muted py-4">No color tokens yet.</p>
            )}
          </Card>

          <Card id="typography">
            <CardTitle className="mb-3 inline-flex items-center gap-2">
              <Type className="text-fg-secondary h-4 w-4" aria-hidden="true" />
              Typography
            </CardTitle>
            {assetsByKind.font.length ? (
              <ul className="divide-border divide-y">
                {assetsByKind.font.map((asset) => (
                  <li key={asset.id} className="flex items-center justify-between py-3">
                    <span className="text-body font-semibold">{asset.name}</span>
                    <Badge>font</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-fg-muted py-4">No fonts catalogued yet.</p>
            )}
          </Card>

          <Card id="voice">
            <CardTitle className="mb-3">Voice &amp; Tone</CardTitle>
            {rules.length ? (
              <ul className="space-y-2">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    data-testid={`brand-voice-rule-${rule.id}`}
                    className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
                  >
                    <Badge
                      variant={
                        rule.ruleType === "dont"
                          ? "danger"
                          : rule.ruleType === "do"
                            ? "success"
                            : "info"
                      }
                    >
                      {rule.ruleType}
                    </Badge>
                    <p className="text-body text-fg-primary mt-2">{rule.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Palette className="h-7 w-7" />}
                title="No voice guidance"
                description="Add do/dont/consider rules so the team writes in one voice."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
