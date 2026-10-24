import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { mutatingApiHeaders } from "@/lib/security/headers";

/**
 * Apply the shared cron transport authorization contract before a job runs.
 * Job-specific flags, logging, and failure responses remain with each route.
 */
export function authorizeCronRequest(headers: Pick<Headers, "get">): NextResponse | null {
  if (isCronAuthorized(headers)) return null;
  return new NextResponse("Unauthorized", { status: 401, headers: mutatingApiHeaders() });
}
