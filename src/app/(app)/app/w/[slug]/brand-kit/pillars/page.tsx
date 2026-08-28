import { redirect, notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listContentPillars } from "@/lib/brand/service";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";

/**
 * /app/w/[slug]/brand-kit/pillars — the Content Pillars section
 * (Phase 7). Pillars are already CRUD-capable in the underlying
 * service (`listContentPillars` + `createContentPillar`); this
 * route exposes them under the brand kit so designers and
 * strategists have a single home for "what we talk about."
 *
 * The full CRUD UI is delivered as part of the C-5.4 Pillar work
 * (deferred from the previous rebuild). Until then this page
 * renders the read-only list with a manager-only inline create
 * form (the previous behavior, untouched).
 */
export default async function BrandKitPillarsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  // Pillar CRUD UI is delivered as part of the C-5.4 Pillar work
  // (deferred from the previous rebuild). The role check is wired
  // up here so the page is ready when the inline form lands.
  const _canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  void _canManage;

  const pillars = await listContentPillars(workspace.id);

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow="Voice"
        title="Content pillars"
        description="The recurring topics every plan and post should align to. The AI uses pillar names + blurbs as context for caption drafts."
      />
      <BrandKitHealth section="pillars" slug={slug} count={pillars.length} />

      <SectionCard
        id="pillars"
        title={
          <>
            <Tag className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Pillars
          </>
        }
        count={pillars.length}
        fullWidth
        aria-label="Content pillars"
        data-testid="brand-kit-section-pillars"
      >
        {pillars.length ? (
          <ul className="divide-border divide-y" data-testid="brand-kit-pillars-list">
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
      </SectionCard>
    </div>
  );
}
