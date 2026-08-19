import { WorkspaceNavigation } from "@/components/workspace/workspace-navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace, getClientWorkspace } from "@/lib/workspaces/context";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const actor = session?.user?.id ? { id: session.user.id } : null;
  const internalWorkspace = actor ? await getAccessibleWorkspace(actor, slug) : null;
  const clientWorkspace =
    actor && !internalWorkspace ? await getClientWorkspace(actor, slug) : null;
  return (
    <>
      {internalWorkspace || clientWorkspace ? (
        <WorkspaceNavigation slug={slug} clientOnly={!internalWorkspace && !!clientWorkspace} />
      ) : null}
      {children}
    </>
  );
}
