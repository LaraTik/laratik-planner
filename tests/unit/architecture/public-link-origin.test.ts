import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Invariant: a shareable URL is never built from the raw request origin.
 *
 * The container runs behind Traefik with `HOSTNAME=0.0.0.0` (see
 * `Dockerfile`), so the host a route handler observes is the proxy-facing
 * bind address. Reading `.origin` straight off `req.url` / `req.nextUrl`
 * and pasting it into a link that leaves the app produces
 * `http://0.0.0.0:3000/...` — unusable for the recipient.
 *
 * This already happened twice in the same feature, which is why it is
 * pinned structurally rather than per-route:
 *
 *   - `api/media/assets/[id]/public-link`  — fixed, hardened in 4ed0522a
 *   - `api/media/share-collections`        — fixed later; the guard above
 *                                           was never applied here
 *
 * So the rule lives in one place, `src/lib/http/public-app-origin.ts`, and
 * this test is the net: any future route that reads an origin off the
 * request must route it through the resolver. Reading `new URL(req.url)`
 * for **query params** is fine and not flagged — only `.origin` is.
 *
 * If a route legitimately needs the raw origin (none exist today), delete
 * it rather than adding an exception: the resolver's whole job is that a
 * public link has a correct origin without the call site knowing how the
 * app is deployed.
 */

const apiRoot = resolve(process.cwd(), "src/app/api");

const RAW_ORIGIN_READS = [
  /new URL\(\s*(?:req|request)\.url\s*\)\.origin/,
  /(?:req|request)\.nextUrl\.origin/,
];

function collectRouteFiles(directory: string, relativeDirectory = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (entry.isDirectory()) return collectRouteFiles(absolutePath, relativePath);
    return entry.name === "route.ts" ? [relativePath] : [];
  });
}

describe("public link origin", () => {
  it("routes every request-derived origin through resolvePublicAppOrigin", () => {
    const offenders = collectRouteFiles(apiRoot).filter((relativePath) => {
      const source = readFileSync(resolve(apiRoot, relativePath), "utf8");
      const readsRawOrigin = RAW_ORIGIN_READS.some((pattern) => pattern.test(source));
      return readsRawOrigin && !source.includes("resolvePublicAppOrigin");
    });

    expect(offenders).toEqual([]);
  });
});
