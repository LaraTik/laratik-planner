import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels, workspaces } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isWorkspaceMember } from "@/lib/auth/policy";
import { QuickCreateForm } from "./quick-create-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Quick Create · ${(await params).slug}` };
}

export default async function QuickCreatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  if (!ws) notFound();

  if (!(await isWorkspaceMember({ id: session.user.id }, ws.id))) {
    return (
      <div className="space-y-4">
        <h1 className="text-title-page text-fg-primary font-semibold">No access</h1>
        <p className="text-body text-fg-secondary">You&apos;re not a member of this workspace.</p>
        <Button asChild variant="ghost">
          <Link href={`/app/w/${slug}/planning`}>← Back to Planning</Link>
        </Button>
      </div>
    );
  }

  const channels = await db
    .select({
      id: socialChannels.id,
      accountName: socialChannels.accountName,
      platform: socialChannels.platform,
    })
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, ws.id),
        eq(socialChannels.isActive, true),
        isNull(socialChannels.archivedAt),
      ),
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">Quick Create</h1>
        <p className="text-body text-fg-secondary mt-1">
          Four fields, a draft is born. Edit anything later.
        </p>
      </header>
      <QuickCreateForm workspaceSlug={slug} channels={channels} />
    </div>
  );
}
