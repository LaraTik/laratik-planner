import { NextResponse, type NextRequest } from "next/server";
import { dispatchDeadlineReminders } from "@/features/content/server";
import { authorizeCronRequest } from "@/lib/cron/route-auth";
import { logError } from "@/lib/observability/logger";
import { mutatingApiHeaders } from "@/lib/security/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: NextRequest) {
  const authResponse = authorizeCronRequest(request.headers);
  if (authResponse) return authResponse;

  const startedAt = Date.now();
  try {
    const result = await dispatchDeadlineReminders();
    return NextResponse.json(
      { ok: true, ...result, durationMs: Date.now() - startedAt },
      { headers: mutatingApiHeaders() },
    );
  } catch (err) {
    logError("cron.deadline_reminders_failed", { err });
    return NextResponse.json(
      { ok: false, error: "deadline reminders failed", durationMs: Date.now() - startedAt },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
