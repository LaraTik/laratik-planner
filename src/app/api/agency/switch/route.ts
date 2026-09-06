import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { switchAgencyContext } from "@/lib/auth/agency-switch";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const agencyId =
    typeof body === "object" &&
    body !== null &&
    "agencyId" in body &&
    typeof body.agencyId === "string"
      ? body.agencyId
      : "";
  if (!agencyId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await switchAgencyContext({ id: session.user.id }, agencyId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "not-a-member" ? 403 : 503 },
    );
  }

  return NextResponse.json({ redirectTo: result.destination });
}
