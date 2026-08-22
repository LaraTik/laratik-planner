import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import {
  Archive,
  Clock,
  ExternalLink,
  Folder,
  Link as LinkIcon,
  Palette,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import {
  listBrandLinkedResources,
  listBrandPublishingRules,
  listContentPillars,
  listRecentBrandUpdates,
} from "@/lib/brand/service";
import { getSignedDownloadUrl } from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { WorkspaceTopTabs } from "@/components/workspace/top-tabs";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { ColorForm } from "./color-form";
import { VoiceForm } from "./voice-form";
import { LogoForm } from "./logo-form";
import { TypographyForm } from "./typography-form";
import { LinkedResourceForm } from "./linked-resource-form";
import { PublishingRuleForm } from "./publishing-rule-form";
import {
  archiveColorAssetAction,
  archiveFontAssetAction,
  archiveLinkedResourceAction,
  archiveLogoAssetAction,
  archivePublishingRuleAction,
  archiveVoiceRuleAction,
} from "./actions";

/**
 * Brand kit (Goal 4 master prompt §3) — workspace-scoped reference
 * for visual assets and writing guidance.
 *
 * Round 3 (commit G, Brand Kit) refactored the layout to match the
 * Stitch design (project 5403097764334458790, screen 16aaf0a9): a
 * 12-column Bento grid replaces the 200px left-rail nav, and a
 * sticky `<WorkspaceTopTabs />` strip below the page header provides
 * the same jump-to-section affordance in less vertical space.
 *
 * Section grid (per the Stitch HTML):
 *
 *   row 1  col-span-12  Brand identity (read-only summary card)
 *   row 2  col-span-8   Logo Assets        col-span-4  Color Palette
 *   row 3  col-span-12  Typography
 *   row 4  col-span-6   Voice & tone       col-span-6  Content Pillars
 *   row 5  col-span-4   Publishing Rules   col-span-4  Linked Resources
 *   row 6  col-span-12  Recent Updates
 *
 * Publishing rules and linked resources are listers in
 * `src/lib/brand/service.ts`; the page pulls them in the same
 * `Promise.all` as the rest of the Brand Kit data. External URLs
 * are rendered as `<a target="_blank" rel="noreferrer">` and never
 * fetched server-side.
 */
export default async function BrandKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const actor = { id: session.user.id };
  const canManage = await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]);
  const [assets, rules, pillars, recent, publishingRules, linkedResources] = await Promise.all([
    db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.workspaceId, workspace.id), isNull(brandAssets.archivedAt))),
    db.select().from(brandVoiceRules).where(eq(brandVoiceRules.workspaceId, workspace.id)),
    listContentPillars(workspace.id),
    listRecentBrandUpdates(workspace.id),
    listBrandPublishingRules(workspace.id),
    listBrandLinkedResources(workspace.id),
  ]);

  // Group assets by kind so the "Logo Assets" / "Color Palette" /
  // "Typography" sections can be populated from a single table.
  const assetsByKind = {
    logo: assets.filter((a) => a.kind === "logo"),
    color: assets.filter((a) => a.kind === "color"),
    font: assets.filter((a) => a.kind === "font"),
    other: assets.filter((a) => a.kind === "other"),
  } as const;

  const tabs: { id: string; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "logo", label: "Assets", count: assetsByKind.logo.length },
    { id: "guidelines", label: "Guidelines" },
    { id: "voice", label: "Voice & tone", count: rules.length },
    { id: "publishing", label: "Publishing rules" },
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
        action={
          <>
            <Button
              type="button"
              variant="secondary"
              size="default"
              data-testid="brand-kit-add-asset"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add asset
            </Button>
            <Button
              type="button"
              variant="default"
              size="default"
              data-testid="brand-kit-edit"
              asChild
            >
              <a href="#logo">Edit brand kit</a>
            </Button>
          </>
        }
      />

      <WorkspaceTopTabs tabs={tabs} ariaLabel="Brand kit sections" />

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6"
        data-testid="brand-kit-bento"
      >
        {/* Row 1 — Brand identity (full width) */}
        <Card id="overview" className="scroll-mt-20 lg:col-span-12" aria-label="Brand identity">
          <div className="flex flex-col items-start gap-6 sm:flex-row">
            <div
              className="border-border bg-surface-subtle flex h-24 w-24 shrink-0 items-center justify-center rounded-[var(--radius-control)] border sm:h-32 sm:w-32"
              aria-hidden="true"
            >
              <Palette className="text-fg-muted h-12 w-12" />
            </div>
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <CardTitle>{workspace.name}</CardTitle>
                <Badge variant="info">Primary Brand</Badge>
              </div>
              <p className="text-body text-fg-secondary mb-4 max-w-2xl">
                The shared source for visual assets and writing guidance. Update the logo, color
                palette, and typography so every planner, designer, and reviewer ships in one voice.
              </p>
              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col gap-1">
                  <span className="text-label text-fg-muted font-semibold tracking-wider uppercase">
                    Timezone
                  </span>
                  <span className="text-body text-fg-primary inline-flex items-center gap-1 font-semibold">
                    <Clock className="text-fg-muted h-4 w-4" aria-hidden="true" />
                    {workspace.timezone}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Row 2 — Logo (8) + Color (4) */}
        <Card
          id="logo"
          className="scroll-mt-20 lg:col-span-8"
          aria-label="Logo assets"
          data-testid="brand-kit-section-logo"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <CardTitle>Logo Assets</CardTitle>
            {canManage ? (
              <a
                href="#logo"
                className="text-body text-primary hover:underline"
                data-testid="brand-kit-logo-add-link"
              >
                Add asset
              </a>
            ) : null}
          </div>
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

        <Card
          id="color"
          className="scroll-mt-20 lg:col-span-4"
          aria-label="Color palette"
          data-testid="brand-kit-section-color"
        >
          <CardTitle className="mb-3">Color Palette</CardTitle>
          {canManage ? <ColorForm slug={slug} /> : null}
          {assetsByKind.color.length ? (
            <ul className="space-y-3">
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
                    className="flex items-center gap-3"
                    data-testid={`brand-color-${asset.id}`}
                  >
                    <span
                      className="border-border h-10 w-10 shrink-0 rounded border"
                      style={{ backgroundColor: hex }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-label text-fg-primary truncate font-bold">{asset.name}</p>
                      <p className="text-label text-fg-muted font-mono">{hex}</p>
                    </div>
                    {canManage ? (
                      <form action={archiveColorAssetAction.bind(null, slug, asset.id)}>
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

        {/* Row 3 — Typography (12) */}
        <Card
          id="guidelines"
          className="scroll-mt-20 lg:col-span-12"
          aria-label="Typography"
          data-testid="brand-kit-section-typography"
        >
          <CardTitle className="mb-3">Typography</CardTitle>
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

        {/* Row 4 — Voice & tone (6) + Content Pillars (6) */}
        <Card
          id="voice"
          className="scroll-mt-20 lg:col-span-6"
          aria-label="Voice and tone"
          data-testid="brand-kit-section-voice"
        >
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

        <Card
          id="pillars"
          className="scroll-mt-20 lg:col-span-6"
          aria-label="Content pillars"
          data-testid="brand-kit-section-pillars"
        >
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

        {/* Row 5 — Publishing Rules (4) + Linked Resources (4) + gap placeholder (4) */}
        <Card
          id="publishing"
          className="scroll-mt-20 lg:col-span-4"
          aria-label="Publishing rules"
          data-testid="brand-kit-section-publishing"
        >
          <CardTitle className="mb-3 inline-flex items-center gap-2">
            <LinkIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Publishing Rules
          </CardTitle>
          {canManage ? <PublishingRuleForm slug={slug} /> : null}
          {publishingRules.length ? (
            <ul className="space-y-2" data-testid="brand-kit-publishing-rules">
              {publishingRules.map((rule) => {
                const ruleLabel =
                  rule.ruleType === "alt_text"
                    ? "Alt text"
                    : rule.ruleType === "hashtag"
                      ? "Hashtags"
                      : rule.ruleType === "compliance"
                        ? "Compliance"
                        : rule.ruleType === "channel"
                          ? "Channel-specific"
                          : "General";
                const badgeVariant =
                  rule.ruleType === "compliance"
                    ? "warning"
                    : rule.ruleType === "channel"
                      ? "info"
                      : "default";
                return (
                  <li
                    key={rule.id}
                    data-testid={`brand-publishing-rule-${rule.id}`}
                    className="bg-surface-subtle flex flex-col gap-1 rounded-[var(--radius-control)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Badge variant={badgeVariant} className="w-fit capitalize">
                          {ruleLabel}
                        </Badge>
                        <p className="text-body text-fg-primary font-semibold">{rule.title}</p>
                      </div>
                      {canManage ? (
                        <form action={archivePublishingRuleAction.bind(null, slug, rule.id)}>
                          <Button
                            type="submit"
                            size="icon"
                            variant="ghost"
                            aria-label={`Archive publishing rule ${rule.title}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <p className="text-body text-fg-secondary whitespace-pre-line">
                      {rule.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body text-fg-muted py-4">
              No publishing rules yet. Add the first one to set guidance for your team.
            </p>
          )}
        </Card>

        <Card
          id="linked"
          className="scroll-mt-20 lg:col-span-4"
          aria-label="Linked resources"
          data-testid="brand-kit-section-linked"
        >
          <CardTitle className="mb-3 inline-flex items-center gap-2">
            <Folder className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Linked Resources
          </CardTitle>
          {canManage ? <LinkedResourceForm slug={slug} /> : null}
          {linkedResources.length ? (
            <ul className="space-y-2" data-testid="brand-kit-linked-resources">
              {linkedResources.map((resource) => {
                const providerLabel =
                  resource.provider === "google_drive"
                    ? "Google Drive"
                    : resource.provider === "figma"
                      ? "Figma"
                      : resource.provider === "canva"
                        ? "Canva"
                        : resource.provider === "dropbox"
                          ? "Dropbox"
                          : "Other";
                return (
                  <li
                    key={resource.id}
                    data-testid={`brand-linked-resource-${resource.id}`}
                    className="bg-surface-subtle flex flex-col gap-1 rounded-[var(--radius-control)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-label text-fg-muted font-semibold tracking-wider uppercase">
                          {providerLabel}
                        </span>
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-body text-primary inline-flex items-center gap-1 font-semibold break-all hover:underline"
                        >
                          {resource.name}
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      </div>
                      {canManage ? (
                        <form action={archiveLinkedResourceAction.bind(null, slug, resource.id)}>
                          <Button
                            type="submit"
                            size="icon"
                            variant="ghost"
                            aria-label={`Archive linked resource ${resource.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    {resource.description ? (
                      <p className="text-body text-fg-secondary whitespace-pre-line">
                        {resource.description}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body text-fg-muted py-4">
              No linked resources yet. Link a Google Drive, Figma, or Canva library so the team
              knows where to source on-brand material.
            </p>
          )}
        </Card>

        {/* Row 6 — Recent Updates (12) */}
        <Card
          id="recent"
          className="scroll-mt-20 lg:col-span-12"
          aria-label="Recent updates"
          data-testid="brand-kit-section-recent"
        >
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
  );
}
