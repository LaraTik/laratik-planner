import { NextResponse, type NextRequest } from "next/server";
import { captureMessage, isEnabled } from "@/lib/observability/sentry";

/**
 * POST /api/sentry-probe
 *
 * Production-only ingest probe. Sends a single `install-probe` event
 * to Sentry so the operator can confirm the install actually wired
 * up, instead of discovering weeks later that no events were
 * landing. The script `scripts/vps/install-sentry.sh` calls this
 * route at the end of the install.
 *
 * Hardening:
 *   - Reject unless `SENTRY_PROBE_TOKEN` is set in the env. This is
 *     defense-in-depth: even if a future bug exposed this route
 *     publicly, an unconfigured env makes the route 503.
 *   - Reject unless the `x-sentry-probe` header equals
 *     `SENTRY_PROBE_TOKEN`. The operator generates the token
 *     alongside the rest of the Sentry secrets; the install script
 *     passes it in the header.
 *   - Constant-time string compare via `timingSafeEqual` to keep the
 *     token out of timing side channels.
 *
 * Response shape:
 *   - 200 { configured: true,  sent: true }   — Sentry DSN set, event fired
 *   - 200 { configured: false, sent: false }  — DSN not set; the call was a no-op
 *   - 401                                       — header missing or wrong
 *   - 503                                       — SENTRY_PROBE_TOKEN not configured
 *
 * The route is safe to call repeatedly. Each call sends a fresh event
 * tagged `scope: sentry-probe` so the on-call view can filter them
 * out if they pile up.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env["SENTRY_PROBE_TOKEN"];
  if (!expected) {
    return NextResponse.json({ error: "SENTRY_PROBE_TOKEN not configured" }, { status: 503 });
  }
  const provided = request.headers.get("x-sentry-probe") ?? "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Invalid probe token" }, { status: 401 });
  }

  const configured = isEnabled();
  if (configured) {
    captureMessage("install-probe", "info");
  }
  return NextResponse.json({ configured, sent: configured });
}
