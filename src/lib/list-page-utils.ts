import "server-only";

/**
 * Helpers for the Team / Access list pages.
 *
 * All three pages (Agency Members, Workspace Team, Platform Access)
 * drive their filter state through URL search params (e.g.
 * `/app/users?q=ali&role=designer&page=2`). Sharing a parser + href
 * builder keeps the three pages consistent and prevents one page
 * drifting to a different param convention by accident.
 *
 * Conventions:
 *   - `q`     : free-text search (substring of name or email).
 *   - `status`: repeated for each active value, e.g. `?status=active&status=pending`.
 *               Missing or empty string means "no filter".
 *   - `role`  : same shape as `status`.
 *   - `page`  : 1-indexed positive integer; clamped via `parsePage`.
 *   - `size`  : one of `25 | 50 | 100` (clamped to 25 if invalid).
 *
 * Multi-value params are read via `URLSearchParams.getAll(name)` so a
 * caller can write `for (const v of sp.status) {...}`. `parseListFilters`
 * normalises the raw `searchParams` async object too.
 */

export const DEFAULT_PAGE_SIZE = 50 as const;
export const ALLOWED_PAGE_SIZES = [25, 50, 100] as const;
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];

export interface ListFilters {
  /** Trimmed free-text query, or empty string for no search. */
  q: string;
  /** Active status values, lowercased and de-duplicated. */
  status: string[];
  /** Active role values, lowercased and de-duplicated. */
  role: string[];
  /** 1-indexed page. */
  page: number;
  /** Page size; clamped to one of the allowed sizes. */
  size: AllowedPageSize;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Normalise a raw `searchParams` object (which Next.js delivers as
 * `Record<string, string | string[] | undefined>`) into a
 * `URLSearchParams`-like record so we can reuse the helpers. Array
 * values are joined with `&` so they round-trip through
 * `URLSearchParams.toString()`; single values pass through unchanged.
 */
export function normaliseSearchParams(raw: RawSearchParams | URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  if (raw instanceof URLSearchParams) {
    raw.forEach((v, k) => out.append(k, v));
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== undefined && v !== null) out.append(key, String(v));
    } else if (value !== "") {
      out.append(key, String(value));
    }
  }
  return out;
}

export function parsePage(raw: string | undefined | null): number {
  if (raw === undefined || raw === null || raw === "") return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function parsePageSize(raw: string | undefined | null): AllowedPageSize {
  const n = Number.parseInt(raw ?? "", 10);
  if (n === 25 || n === 50 || n === 100) return n;
  return DEFAULT_PAGE_SIZE;
}

function uniqueLower(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function parseListFilters(raw: RawSearchParams | URLSearchParams): ListFilters {
  const sp = normaliseSearchParams(raw);
  return {
    q: (sp.get("q") ?? "").trim().slice(0, 200),
    status: uniqueLower(sp.getAll("status")),
    role: uniqueLower(sp.getAll("role")),
    page: parsePage(sp.get("page")),
    size: parsePageSize(sp.get("size")),
  };
}

/**
 * Build a URL for a paginated list given the base path + the current
 * filter state + the requested change. Pass only the keys you want to
 * change; omitted keys inherit from `current`.
 *
 * Multi-value params (status, role) REPLACE the current value list
 * (they're chips, not additive). If `next.status` is undefined the
 * current status list is preserved — pass `[]` explicitly to clear.
 */
export function buildListHref(args: {
  basePath: string;
  current: Pick<ListFilters, "q" | "status" | "role" | "size">;
  next?: {
    q?: string;
    status?: string[];
    role?: string[];
    page?: number;
    size?: AllowedPageSize;
    clear?: boolean;
  };
}): string {
  const { basePath, current, next = {} } = args;
  const sp = new URLSearchParams();
  const q = next.q !== undefined ? next.q : current.q;
  const status = next.status !== undefined ? next.status : current.status;
  const role = next.role !== undefined ? next.role : current.role;
  const size = next.size ?? current.size;
  // Pages that are 1 are omitted — the same as the existing
  // platform/errors pattern, which keeps shareable URLs short.
  const page = next.page ?? 1;

  if (q) sp.set("q", q);
  for (const s of status) sp.append("status", s);
  for (const r of role) sp.append("role", r);
  if (size !== DEFAULT_PAGE_SIZE) sp.set("size", String(size));
  if (page > 1) sp.set("page", String(page));

  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Convenience: does the URL have any filter applied?
 * Used to gate the "Clear" link rendering.
 */
export function hasActiveFilters(filters: ListFilters): boolean {
  return (
    filters.q.length > 0 ||
    filters.status.length > 0 ||
    filters.role.length > 0 ||
    filters.size !== DEFAULT_PAGE_SIZE
  );
}

/**
 * Compute the paginated slice from a list. Returns the rows to render
 * plus the matching metadata the page needs to render counter + prev/next.
 *
 * The caller still owns the SQL — this helper accepts arrays because
 * some pages filter in memory after their query (e.g. status counts),
 * not in SQL. For pages where SQL is the right place, build the LIMIT
 * + OFFSET in your own query and pass `total = filtered.length`.
 */
export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  matched: number;
  from: number;
  to: number;
  page: number;
  totalPages: number;
}

export function paginate<T>(
  rows: readonly T[],
  page: number,
  size: AllowedPageSize,
): PaginatedResult<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  // Clamp FIRST so the rendered slice and the rendered range both
  // agree with `page`. Clamping only `page` (as the original draft
  // did) returned a row slice of `[]` while `from = (page-1)*size+1`
  // — a confusing "Page 3 of 3 but Showing 201–400 of 137" UI.
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * size;
  const end = Math.min(total, start + size);
  const slice = rows.slice(start, end) as T[];
  const from = total === 0 ? 0 : start + 1;
  const to = total === 0 ? 0 : end;
  return {
    rows: slice,
    total,
    matched: total,
    from,
    to,
    page: safePage,
    totalPages,
  };
}
