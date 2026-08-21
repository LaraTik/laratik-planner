import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Archive, Clock, Palette, Tag, Trash2, Type } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listContentPillars, listRecentBrandUpdates } from "@/lib/brand/service";
import { getSignedDownloadUrl } from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { ColorForm } from "./color-form";
import { VoiceForm } from "./voice-form";
import { LogoForm } from "./logo-form";
import { TypographyForm } from "./typography-form";
import {
  archiveColorAssetAction,
  archiveFontAssetAction,
  archiveLogoAssetAction,
  archiveVoiceRuleAction,
} from "./actions";

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
  const actor = { id: session.user.id };
  const canManage = await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]);
  const [assets, rules, pillars, recent] = await Promise.all([
    db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.workspaceId, workspace.id), isNull(brandAssets.archivedAt))),
    db.select().from(brandVoiceRules).where(eq(brandVoiceRules.workspaceId, workspace.id)),
    listContentPillars(workspace.id),
    listRecentBrandUpdates(workspace.id),
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
    { id: "pillars", label: "Content Pillars", count: pillars.length },
    { id: "recent", label: "Recent Updates", count: recent.length },
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
            {canManage ? <LogoForm slug={slug} workspaceId={workspace.id} /> : null}
            {assetsByKind.logo.length ? (
              <ul className="divide-border divide-y">
                {assetsByKind.logo.map((asset) => {
                  // Preview URL: prefer the storage path (uploaded
                  // file) over the external URL. We wrap external
                  // URLs as data-less <img> tags; the storage helper
                  // returns a signed download URL when a path is
                  // present.
                  const previewSrc = asset.storagePath
                    ? getSignedDownloadUrl(asset.storagePath)
                    : asset.externalUrl;
                  return (
                    <li
                      key={asset.id}
                      className="flex items-center justify-between gap-3 py-3"
                      data-testid={`brand-asset-${asset.id}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {previewSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewSrc}
                            alt=""
                            width={40}
                            height={40}
                            className="border-border bg-surface-subtle h-10 w-10 shrink-0 rounded border object-contain"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="border-border bg-surface-subtle h-10 w-10 shrink-0 rounded border"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-body text-fg-primary truncate font-semibold">
                            {asset.name}
                          </p>
                          <p className="text-label text-fg-muted">
                            {asset.storagePath
                              ? "Uploaded file"
                              : asset.externalUrl
                                ? "External URL"
                                : "Logo"}
                          </p>
                        </div>
                      </div>
                      {canManage ? (
                        <form action={archiveLogoAssetAction.bind(null, slug, asset.id)}>
                          <Button
                            type="submit"
                            size="icon"
                            variant="ghost"
                            aria-label={`Archive logo ${asset.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-body text-fg-muted py-4">No logo assets yet.</p>
            )}
          </Card>

          <Card id="color">
            <CardTitle className="mb-3">Color Palette</CardTitle>
            {canManage ? <ColorForm slug={slug} /> : null}
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
                      {canManage ? (
                        <form
                          action={archiveColorAssetAction.bind(null, slug, asset.id)}
                          className="ml-2"
                        >
                          <Button
                            type="submit"
                            size="icon"
                            variant="ghost"
                            aria-label={`Archive ${asset.name}`}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </form>
                      ) : null}
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
            {canManage ? <TypographyForm slug={slug} /> : null}
            {assetsByKind.font.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {assetsByKind.font.map((asset) => {
                  // `value` jsonb holds { family, weight, role }.
                  // Older rows may have these at different keys; we
                  // try a few candidates and fall back to a safe
                  // default.
                  const v = (asset.value ?? {}) as Record<string, unknown>;
                  const family =
                    (typeof v.family === "string" && v.family) ||
                    (typeof v.name === "string" && v.name) ||
                    "Inter";
                  const weight =
                    typeof v.weight === "number"
                      ? v.weight
                      : typeof v.weight === "string"
                        ? Number(v.weight) || 400
                        : 400;
                  const role = typeof v.role === "string" ? v.role.toLowerCase() : "body";
                  const sampleText = "The quick brown fox jumps over the lazy dog";
                  const sampleSize = role === "headline" ? 28 : role === "accent" ? 22 : 16;
                  return (
                    <li
                      key={asset.id}
                      data-testid={`brand-font-${asset.id}`}
                      className="border-border bg-surface-subtle flex flex-col gap-2 rounded-[var(--radius-control)] border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <p className="text-body text-fg-primary truncate font-semibold">
                            {asset.name}
                          </p>
                          <p className="text-label text-fg-muted">
                            {family} {weight} · {role}
                          </p>
                        </div>
                        {canManage ? (
                          <form action={archiveFontAssetAction.bind(null, slug, asset.id)}>
                            <Button
                              type="submit"
                              size="icon"
                              variant="ghost"
                              aria-label={`Archive font ${asset.name}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </form>
                        ) : null}
                      </div>
                      <p
                        className="border-border bg-surface rounded-[var(--radius-control)] border p-2"
                        style={{
                          fontFamily: `"${family}", system-ui, sans-serif`,
                          fontWeight: weight,
                          fontSize: `${sampleSize}px`,
                          lineHeight: 1.4,
                        }}
                      >
                        {sampleText}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-body text-fg-muted py-4">No fonts catalogued yet.</p>
            )}
          </Card>

          <Card id="voice">
            <CardTitle className="mb-3">Voice &amp; Tone</CardTitle>
            {canManage ? <VoiceForm slug={slug} /> : null}
            {rules.length ? (
              <ul className="space-y-2">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    data-testid={`brand-voice-rule-${rule.id}`}
                    className="bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-control)] p-3"
                  >
                    <Badge
                      className="shrink-0 capitalize"
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
                    <p className="text-body text-fg-primary flex-1">{rule.content}</p>
                    {canManage ? (
                      <form action={archiveVoiceRuleAction.bind(null, slug, rule.id)}>
                        <Button
                          type="submit"
                          size="icon"
                          variant="ghost"
                          aria-label={`Archive voice rule ${rule.id}`}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : null}
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

          <Card id="pillars">
            <CardTitle className="mb-3 inline-flex items-center gap-2">
              <Tag className="text-fg-secondary h-4 w-4" aria-hidden="true" />
              Content Pillars
            </CardTitle>
            {pillars.length ? (
              <ul className="divide-border divide-y">
                {pillars.map((pillar) => (
                  <li
                    key={pillar.id}
                    className="flex items-center justify-between py-3"
                    data-testid={`brand-pillar-${pillar.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {pillar.color ? (
                        <span
                          className="border-border h-4 w-4 shrink-0 rounded-full border"
                          style={{ backgroundColor: pillar.color }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="text-body text-fg-primary font-semibold">{pillar.name}</span>
                    </div>
                    {pillar.description ? (
                      <span className="text-label text-fg-muted ml-3 truncate">
                        {pillar.description}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-fg-muted py-4">No content pillars yet.</p>
            )}
          </Card>

          <Card id="recent">
            <CardTitle className="mb-3">Recent Updates</CardTitle>
            {recent.length ? (
              <div className="overflow-x-auto">
                <table className="text-body w-full text-left">
                  <thead>
                    <tr className="text-label text-fg-muted">
                      <th className="pr-3 pb-2 font-semibold">Date</th>
                      <th className="pr-3 pb-2 font-semibold">Description</th>
                      <th className="pb-2 font-semibold">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {recent.map((update, index) => (
                      <tr key={`${update.kind}-${index}`} data-testid="brand-recent-row">
                        <td className="text-fg-secondary py-2 pr-3">
                          {formatRelativeDate(update.updatedAt)}
                        </td>
                        <td className="text-fg-primary py-2 pr-3">{update.description}</td>
                        <td className="py-2">
                          <span className="bg-surface-subtle text-fg-secondary text-label inline-flex h-6 w-6 items-center justify-center rounded-full font-semibold">
                            M
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-body text-fg-muted py-4">No recent updates yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
