/**
 * Workspace URLs — the single source of truth.
 *
 * WHY THIS FILE EXISTS
 *
 * Workspace slugs are unique only within an agency, not globally
 * (`workspace_agency_slug_unique` on `(agencyId, lower(slug))` in
 * `schema/workspaces.ts`). The route used to be `/app/w/[workspaceSlug]` with
 * no agency in it, and `findWorkspaceBySlug` fell through to
 * `resolveActiveAgencyContext` — the *recipient's* sticky active-agency cookie.
 *
 * That made a shared link mean "the workspace with this slug in whatever agency
 * the person opening the link happens to have active". A colleague in a second
 * agency either 404'd or landed on a DIFFERENT tenant's workspace and, quite
 * reasonably, treated it as the sender's.
 *
 * Not a privilege escalation — every hop is membership-gated and an explicit
 * override fails closed — but a wrong-destination bug with real data-integrity
 * consequences. The fix is to make the URL self-describing, which means every
 * link has to be built from one place. That is this module.
 *
 * CANONICAL SHAPE
 *
 *   /app/a/<agencySlug>/w/<workspaceSlug>[/<section>][?query]
 *
 * Both segments are required. `parseWorkspacePath` is the inverse, and
 * `workspaceHref` is the only supported way to build one — the `/app/w/` form
 * exists only inside the legacy-redirect helper below.
 */

/** Matches the canonical prefix; the capture groups are the two required slugs. */
const CANONICAL_WORKSPACE_RE = /^\/app\/a\/([^/]+)\/w\/([^/]+)(\/[^?]*)?(\?.*)?$/;

/** The pre-refactor shape. Only `legacyToCanonicalHref` should build these. */
const LEGACY_WORKSPACE_RE = /^\/app\/w\/([^/]+)(\/[^?]*)?(\?.*)?$/;

/** `/app/<segment>` — the app-level (non-workspace) routes. */
const APP_SEGMENTS = [
  "account",
  "agency-settings",
  "calendar",
  "media",
  "platform",
  "tasks",
  "users",
  "workspaces",
] as const;

export type AppSegment = (typeof APP_SEGMENTS)[number];

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Canonical workspace base, e.g. `/app/a/acme/w/food-game`.
 *
 * Slugs are already restricted to `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` by a
 * CHECK constraint, so encoding is a no-op in practice — it is there so a
 * malformed value can never break out of its path segment.
 */
export function workspaceBasePath(agencySlug: string, workspaceSlug: string): string {
  return `/app/a/${encodeSegment(agencySlug)}/w/${encodeSegment(workspaceSlug)}`;
}

/**
 * Build a workspace URL. `rest` is appended as path segments; `query` is
 * appended verbatim as a query string (with or without the leading `?`).
 *
 *   workspaceHref("acme", "food-game")                       // /app/a/acme/w/food-game
 *   workspaceHref("acme", "food-game", "planning")            // …/planning
 *   workspaceHref("acme", "food-game", "planning", "?month=2026-11")
 */
export function workspaceHref(
  agencySlug: string,
  workspaceSlug: string,
  rest?: string | string[],
  query?: string,
): string {
  const base = workspaceBasePath(agencySlug, workspaceSlug);
  const tail = Array.isArray(rest) ? rest.join("/") : rest;
  const segments = (tail ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(encodeSegment);
  const path = segments.length ? `${base}/${segments.join("/")}` : base;
  if (!query) return path;
  return `${path}${query.startsWith("?") ? query : `?${query}`}`;
}

export type ParsedWorkspacePath = {
  agencySlug: string;
  workspaceSlug: string;
  /** Sub-path after the workspace slug, without a leading slash. `""` at the root. */
  rest: string;
  /** Raw query string including the leading `?`, or `""`. */
  query: string;
};

/** Parse a canonical workspace path. Returns `null` for anything else. */
export function parseWorkspacePath(pathname: string): ParsedWorkspacePath | null {
  const match = CANONICAL_WORKSPACE_RE.exec(pathname);
  // The regex guarantees both captures; the guard only satisfies
  // `noUncheckedIndexedAccess` without a non-null assertion.
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  return {
    agencySlug: decodeURIComponent(match[1]),
    workspaceSlug: decodeURIComponent(match[2]),
    rest: (match[3] ?? "").replace(/^\//, ""),
    query: match[4] ?? "",
  };
}

export type ParsedLegacyWorkspacePath = {
  workspaceSlug: string;
  rest: string;
  query: string;
};

/** Parse a pre-refactor `/app/w/<slug>` path. */
export function parseLegacyWorkspacePath(pathname: string): ParsedLegacyWorkspacePath | null {
  const match = LEGACY_WORKSPACE_RE.exec(pathname);
  if (!match || match[1] === undefined) return null;
  return {
    workspaceSlug: decodeURIComponent(match[1]),
    rest: (match[2] ?? "").replace(/^\//, ""),
    query: match[3] ?? "",
  };
}

/**
 * `/app/w/<slug>/…` → `/app/a/<agencySlug>/w/<slug>/…`
 *
 * The ONLY sanctioned use of the legacy shape: the redirect that keeps old
 * bookmarks and previously-shared links working. Never link to this form.
 */
export function legacyToCanonicalHref(
  legacyPathname: string,
  resolveAgencySlug: (workspaceSlug: string) => string | null,
): string | null {
  const parsed = parseLegacyWorkspacePath(legacyPathname);
  if (!parsed) return null;
  const agencySlug = resolveAgencySlug(parsed.workspaceSlug);
  if (!agencySlug) return null;
  return workspaceHref(agencySlug, parsed.workspaceSlug, parsed.rest, parsed.query);
}

export function isAppSegment(segment: string): segment is AppSegment {
  return (APP_SEGMENTS as readonly string[]).includes(segment);
}

export function appHref(segment: AppSegment, rest?: string | string[], query?: string): string {
  const base = `/app/${segment}`;
  const tail = Array.isArray(rest) ? rest.join("/") : rest;
  const segments = (tail ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(encodeSegment);
  const path = segments.length ? `${base}/${segments.join("/")}` : base;
  if (!query) return path;
  return `${path}${query.startsWith("?") ? query : `?${query}`}`;
}
