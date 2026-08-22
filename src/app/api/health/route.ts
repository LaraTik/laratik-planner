/**
 * GET /api/health
 *
 * Backwards-compatible alias for /api/health/ready. Kept so existing
 * callers (Traefik via the loadbalancer.server.url, the VPS deploy
 * gate, monitoring dashboards) keep working without any change.
 *
 * New code should prefer the explicit endpoint:
 *   - /api/health/live  → "is the process up?" (liveness)
 *   - /api/health/ready → "can the process serve traffic?" (readiness)
 *
 * See the K8s / 12-factor pattern in the docs/testing/strategy.md
 * release-gates section.
 *
 * NOTE: Next.js requires `dynamic` and `runtime` to be declared locally
 * in each route file. They cannot be re-exported from another route, so
 * we redeclare them here and only re-export `GET`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export { GET } from "./ready/route";
