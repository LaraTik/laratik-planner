import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/workspace/page-header";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { tForActive } from "@/lib/i18n/t-for-active";
import {
  listAgencyWorkspaceAssistantSkills,
  WorkspaceAssistantSkillDraftSchema,
} from "@/features/workspace-assistant/skill-governance.server";
import { WorkspaceAssistantSkillsForm } from "./workspace-assistant-skills-form";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencyAi.skills.title") };
}

export default async function WorkspaceAssistantSkillsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const { t } = await tForActive();
  if (!(await isAgencyAdmin(actor, context.agencyId))) {
    return (
      <section className="space-y-4" data-testid="assistant-skills-forbidden">
        <PageHeader
          title={t("agencyAi.skills.title")}
          description={t("agencyAi.skills.forbidden")}
        />
        <Link
          href="/app/agency-settings/ai"
          className="text-primary inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("agencyAi.skills.backToAi")}
        </Link>
      </section>
    );
  }

  const records = await listAgencyWorkspaceAssistantSkills(actor, context.agencyId);
  const skills = records.map(({ skill, revisions }) => ({
    id: skill.id,
    slug: skill.slug,
    status: skill.status,
    latestRevision: skill.latestRevision,
    activeRevision: skill.activeRevision,
    revisions: revisions.flatMap((revision) => {
      const snapshot = WorkspaceAssistantSkillDraftSchema.safeParse(revision.snapshot);
      return snapshot.success
        ? [
            {
              revision: revision.revision,
              state: revision.state,
              snapshot: snapshot.data,
              createdBy: revision.createdBy,
            },
          ]
        : [];
    }),
  }));

  return (
    <div className="space-y-6" data-testid="agency-ai-skills-page">
      <PageHeader
        eyebrow={t("agencyAi.eyebrow")}
        title={t("agencyAi.skills.title")}
        description={t("agencyAi.skills.description")}
        action={
          <Link
            href="/app/agency-settings/ai"
            className="text-primary inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("agencyAi.skills.backToAi")}
          </Link>
        }
      />
      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Sparkles className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("agencyAi.skills.securityNote")}</p>
      </div>
      <WorkspaceAssistantSkillsForm skills={skills} />
    </div>
  );
}
