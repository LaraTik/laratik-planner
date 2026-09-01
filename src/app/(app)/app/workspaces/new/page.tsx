import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin, PermissionDeniedError } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import {
  agencies,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { PageHeader } from "@/components/workspace/page-header";
import { revalidatePath } from "next/cache";
import { reserveCapacity } from "@/lib/entitlements";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Create a new workspace.
 *
 * Server action: validates the input, creates the workspace, adds the
 * current user as workspace_manager, and redirects to the new workspace.
 */
export const metadata = { title: "New workspace" };

const FormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Use lowercase letters, digits, and hyphens"),
  timezone: z.string().min(2).default("UTC"),
});

async function createWorkspaceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const actor = await currentActor();
  if (!actor) throw new Error("Not signed in");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) throw new Error("Agency not configured");

  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new PermissionDeniedError("create_workspace");
  }

  const parsed = FormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    timezone: formData.get("timezone") ?? "UTC",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await db.transaction(async (tx) => {
    await reserveCapacity(tx, agencyId, [{ resource: "workspaces", increase: 1 }]);
    // Ensure the current user is agency member + admin
    const [agency] = await tx
      .select({ id: agencies.id })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1);
    if (!agency) throw new Error("Agency not found");

    // Create the workspace
    const [created] = await tx
      .insert(workspaces)
      .values({
        agencyId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        timezone: parsed.data.timezone,
        createdBy: session.user.id,
      })
      .returning({ id: workspaces.id, slug: workspaces.slug });

    // Create a workspace_membership for the creator
    const [membership] = await tx
      .insert(workspaceMemberships)
      .values({
        workspaceId: created!.id,
        userId: session.user.id,
        status: "active",
      })
      .returning({ id: workspaceMemberships.id });

    // Grant workspace_manager role
    await tx.insert(workspaceMembershipRoles).values({
      workspaceMembershipId: membership!.id,
      role: "workspace_manager",
    });

    return { workspaceId: created!.id, slug: created!.slug };
  });

  revalidatePath("/app/workspaces");
  revalidatePath(`/app/w/${result.slug}`);

  redirect(`/app/w/${result.slug}`);
}

export default async function NewWorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const actor = await currentActor();
  if (!actor) return null;
  const { t } = await tForActive();
  const ctx = actor ? await resolveActiveAgencyContext({ actor }) : null;
  const agencyId = ctx?.agencyId ?? null;
  const isAdmin = agencyId ? await isAgencyAdmin(actor, agencyId) : false;

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("workspaceNew.title")} description={t("workspaceNew.adminOnly")} />
        <Link
          href="/app/workspaces"
          className="text-primary focus-visible:ring-focus-ring inline-block rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        >
          {t("workspaceNew.backLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6" data-testid="workspaces-new-form">
      <PageHeader title={t("workspaceNew.title")} description={t("workspaceNew.description")} />

      <Card>
        <form action={createWorkspaceAction} className="space-y-4">
          <FormField
            id="name"
            label={t("workspaceNew.nameLabel")}
            hint={t("workspaceNew.nameHint")}
            required
          >
            <Input
              type="text"
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder={t("workspaceNew.namePlaceholder")}
            />
          </FormField>
          <FormField
            id="slug"
            label={t("workspaceNew.slugLabel")}
            hint={t("workspaceNew.slugHint")}
            required
          >
            <Input
              type="text"
              name="slug"
              required
              minLength={2}
              maxLength={60}
              pattern="^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$"
              placeholder={t("workspaceNew.slugPlaceholder")}
            />
          </FormField>
          <FormField
            id="timezone"
            label={t("workspaceNew.timezonesLabel")}
            hint={t("workspaceNew.timezonesHint")}
          >
            <Input type="text" name="timezone" defaultValue="UTC" placeholder="UTC" />
          </FormField>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" size="lg">
              {t("workspaceNew.create")}
            </Button>
            <Link
              href="/app/workspaces"
              className="text-body text-fg-secondary hover:text-fg-primary"
            >
              {t("workspaceNew.cancel")}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

// avoid unused warnings on the joined tables used only in the action
void and;
void users;
