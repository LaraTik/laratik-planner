import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getMediaLibraryFilters, MediaPermissionError } from "@/features/media/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({
  agencyId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
});

/**
 * Returns distinct tags + uploaders for the active workspace so the
 * library can render faceted filter chips (plan §3.3 / §3.4).
 *
 * Pulled as a separate route so the heavy aggregate queries don't run
 * when the user isn't filtering; the response is cheap to cache.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Query.safeParse({
    agencyId: req.nextUrl.searchParams.get("agencyId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  try {
    const filters = await getMediaLibraryFilters(actor, parsed.data);
    return NextResponse.json(filters, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    if (error instanceof MediaPermissionError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
