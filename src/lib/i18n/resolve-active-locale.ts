import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, agencies } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getPublicLocale } from "@/lib/i18n/cookie";
import {
  resolveLocale,
  SUPPORTED_LOCALES,
  type LocaleCode,
  type LocaleDescriptor,
} from "@/lib/i18n/locales";

/**
 * Server-side interface-locale resolver.
 *
 * Implements the locked precedence from
 * `docs/decisions/0009-user-interface-locale.md`:
 *
 *   1. Authenticated user's validated `users.locale`
 *   2. Validated `laratik_locale` cookie
 *   3. English fallback
 *
 * The `agencies.locale` column is **not** part of the
 * interface chain — it is the *content* default, used by
 * {@link resolveContentLocale} below. This separation is
 * what keeps an Arabic agency writing Arabic content for a
 * planner whose interface is English.
 *
 * Both resolvers are pure of any HTTP context beyond
 * `cookies()` and the database; they take no arguments,
 * read everything they need from the request, and return
 * a discriminated `source` so callers (and observability)
 * know which level produced the answer.
 */

export type InterfaceLocaleSource = "user" | "cookie" | "fallback";

export type ResolvedInterfaceLocale = LocaleDescriptor & {
  source: InterfaceLocaleSource;
};

/**
 * Read the actor's `users.locale` and validate it against the
 * closed `SUPPORTED_LOCALES` set. Returns `null` when the user
 * has no row, when the row's `locale` is null / empty, or when
 * the stored value is not a supported code (defensive against
 * a legacy `en-US` value or a hand-edited DB row).
 */
async function readUserLocale(userId: string): Promise<LocaleCode | null> {
  const [row] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.locale) return null;
  const trimmed = row.locale.trim();
  if (!trimmed) return null;
  return SUPPORTED_LOCALES.some((l) => l.code === trimmed) ? (trimmed as LocaleCode) : null;
}

/**
 * Resolve the active interface locale for the current request.
 *
 * Memoized per call site within the same request: the function
 * is pure given the request context, so wrapping it in
 * `React.cache` (Next.js 16) deduplicates the per-page /
 * per-component calls without any extra plumbing. The cache
 * key is implicit (the request), so a single render tree
 * shares a single resolution.
 */
export const resolveActiveLocale = async (): Promise<ResolvedInterfaceLocale> => {
  const actor = await currentActor();
  if (actor) {
    const fromUser = await readUserLocale(actor.id);
    if (fromUser) {
      const descriptor = resolveLocale(fromUser);
      return { ...descriptor, source: "user" };
    }
  }
  const fromCookie = await getPublicLocale();
  if (fromCookie) {
    const descriptor = resolveLocale(fromCookie);
    return { ...descriptor, source: "cookie" };
  }
  return { ...resolveLocale("en"), source: "fallback" };
};

// ─── Content locale (separate chain) ──────────────────────────────────────

export type ContentLocaleSource = "agency" | "fallback";

export type ResolvedContentLocale = LocaleDescriptor & {
  source: ContentLocaleSource;
};

/**
 * Resolve the *content* locale — the language the agency's
 * brand voice / templates / default captions are written in.
 * Independent of the interface locale. Consulted by:
 *
 *   - the brand kit templates surface
 *   - the AI brief language hint
 *   - the default caption language on a new content item
 *   - the recipient locale of system emails (the *content*
 *     part, not the surrounding chrome)
 *
 * The chain is: active agency locale → English. The actor
 * is consulted only to find the active agency. A signed-out
 * request cannot have a content locale and falls back.
 */
export const resolveContentLocale = async (): Promise<ResolvedContentLocale> => {
  const actor = await currentActor();
  if (actor) {
    const agency = await resolveActiveAgencyContext({ actor });
    if (agency) {
      const [row] = await db
        .select({ locale: agencies.locale })
        .from(agencies)
        .where(eq(agencies.id, agency.agencyId))
        .limit(1);
      const candidate = row?.locale?.trim();
      if (candidate && SUPPORTED_LOCALES.some((l) => l.code === candidate)) {
        return { ...resolveLocale(candidate), source: "agency" };
      }
    }
  }
  return { ...resolveLocale("en"), source: "fallback" };
};
