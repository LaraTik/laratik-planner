import "server-only";
import { auth } from "@/lib/auth/config";
import {
  requirePlatformPermission,
  type PlatformPrincipal,
} from "@/lib/auth/platform-access";
import type { Actor } from "@/lib/auth/policy";

/**
 * Platform-admin route gate (Milestone 1.8).
 *
 * Pure orchestration: read the current NextAuth session, then ask
 * the permission DAL to confirm the actor can enter the platform console.
 * The result is a small discriminated union the layout
 * renders against.
 *
 * Why a separate function and not just inline `requirePlatformAdmin`
 * in the layout?
 *  1. Testability — the layout is an async React component and
 *     exercising its "Forbidden" branch needs a rendered tree. This
 *     function is the unit-testable seam: the unit test mocks
 *     `@/lib/auth/config` (session shape) and
 *     `@/lib/auth/platform-access` (permission throw/no-throw)
 *     and asserts on the returned shape.
 *  2. URL-stability — the layout intentionally does NOT redirect when
 *     the actor fails the gate (per the M1.8 spec: "renders a
 *     'Forbidden' message, not a redirect — keeps the URL stable for
 *     the audit log"). A non-redirecting response means an audit-log
 *     reader can resolve `/app/platform/...` to the same view the
 *     actor saw.
 *  3. Reuse — the same gate shape will back M2 (platform admin
 *     mutation routes) and M3 (agency detail tab actions). The
 *     layout is just one consumer.
 *
 * The "anonymous" reason is split out from "not-platform-admin" so
 * the layout can render a different explanation if needed (anon
 * users don't see /app/* at all, but the gate must not assume that —
 * e.g. tests mount this without auth context).
 */
export type PlatformGateResult =
  | { status: "ok"; principal: PlatformPrincipal }
  | { status: "forbidden"; reason: "anonymous" | "not-platform-admin" };

export async function gatePlatformAdmin(): Promise<PlatformGateResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "forbidden", reason: "anonymous" };
  }
  const actor: Actor = { id: session.user.id };
  try {
    const principal = await requirePlatformPermission(actor, "platform.console.read");
    return { status: "ok", principal };
  } catch {
    // The permission DAL throws PermissionDeniedError. The layout
    // never needs the action code (it just renders Forbidden), so we
    // collapse every failure into `not-platform-admin`.
    return { status: "forbidden", reason: "not-platform-admin" };
  }
}
