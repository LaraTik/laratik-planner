import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin, PermissionDeniedError } from "@/lib/auth/policy";
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

  const agencyId = await activeAgencyId();
  if (!agencyId) throw new Error("Agency not configured");

  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
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
  const agencyId = await activeAgencyId();
  const isAdmin = agencyId ? await isAgencyAdmin({ id: session.user.id }, agencyId) : false;

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New workspace"
          description="Only agency admins can create workspaces. Ask your admin to create one and add you to it."
        />
        <Link
          href="/app/workspaces"
          className="text-primary inline-block underline-offset-4 hover:underline"
        >
          ← Back to Workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="New workspace"
        description="A workspace is one client brand. Each has its own planning, content, and team."
      />

      <Card>
        <form action={createWorkspaceAction} className="space-y-4">
          <FormField id="name" label="Workspace name" hint="e.g. Acme Coffee" required>
            <Input
              type="text"
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Acme Coffee"
            />
          </FormField>
          <FormField
            id="slug"
            label="URL slug"
            hint="Lowercase letters, digits, and hyphens. Used in URLs."
            required
          >
            <Input
              type="text"
              name="slug"
              required
              minLength={2}
              maxLength={60}
              pattern="^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$"
              placeholder="acme-coffee"
            />
          </FormField>
          <FormField id="timezone" label="Timezone" hint="Used to display dates. UTC by default.">
            <Input type="text" name="timezone" defaultValue="UTC" placeholder="UTC" />
          </FormField>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" size="lg">
              Create workspace
            </Button>
            <Link
              href="/app/workspaces"
              className="text-body text-fg-secondary hover:text-fg-primary"
            >
              Cancel
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
