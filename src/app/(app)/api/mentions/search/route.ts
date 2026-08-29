import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { searchMentionableUsers } from "@/lib/mentions/search";

/**
 * GET /api/mentions/search?workspace=<slug>&q=<query>
 *
 * Returns up to 25 mentionable users for the @-picker. The
 * workspace slug is required so we can scope the result to
 * the workspace the actor is currently editing a comment in
 * (cross-workspace mentions are not supported — the picker
 * only surfaces users with a role in this workspace or an
 * agency-admin role).
 *
 * Auth: the actor must be a member of the workspace (or an
 * agency admin) to view the list. The endpoint never returns
 * users from workspaces the actor cannot see.
 *
 * The response shape is the exact shape the `<MentionPicker>`
 * client component consumes:
 *
 *   { users: MentionableUser[] }
 *
 * (See `src/lib/mentions/search.ts` for the MentionableUser
 * shape.)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const workspaceSlug = url.searchParams.get("workspace");
  const query = url.searchParams.get("q") ?? "";
  if (!workspaceSlug) {
    return NextResponse.json({ error: "missing_workspace" }, { status: 400 });
  }

  const ws = await getAccessibleWorkspace(actor, workspaceSlug);
  if (!ws) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const users = await searchMentionableUsers(actor, ws.id, query);
    return NextResponse.json({ users });
  } catch (err) {
    // The search service is defensive — any internal failure
    // surfaces as an empty list (the picker is non-critical),
    // not a 500. Log the error so it's not silently swallowed.
    console.error("[mentions] search failed", err);
    return NextResponse.json({ users: [] });
  }
}
