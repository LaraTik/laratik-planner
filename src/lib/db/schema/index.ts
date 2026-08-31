/**
 * Drizzle schema barrel — re-exports every table and enum so Drizzle Kit
 * can scan one file to find the full data model. The empty `schema` object
 * is required by Drizzle Kit's introspection; the individual tables are
 * imported as a side-effect of this file.
 */
export * from "./enums";
export * from "./_helpers";
export * from "./identity";
export * from "./workspaces";
export * from "./channels";
export * from "./planning";
export * from "./content";
export * from "./discussions";
export * from "./deliveries";
export * from "./publishing";
export * from "./notifications";
export * from "./audit";
export * from "./ai";
export * from "./brand-kit";
export * from "./plans";
export * from "./usage";
export * from "./support";
// M4 — social profile analytics. Imported after identity / workspaces
// because `social-analytics.ts` references both at the schema layer.
// M4.5 — agency social DEK. Imported after identity (agencies, users).
// M4.6 — per-agency social provider config. Imported after identity
// (agencies, users) and after social-dek (the envelope is sealed
// with the same per-agency DEK).
export * from "./social-analytics";
// OBS-002 — in-app mirror of error events surfaced at /app/platform/errors.
// Imported after identity (users) for the actor FK.
export * from "./app-errors";
export * from "./social-dek";
export * from "./provider-config";
// M4.7 / Phase 1 of the social-cron-admin plan: cron_tick_history
// powers the platform-admin /app/platform/operations/cron page and
// the "Run now" audit hook. Imported after identity for the optional
// actor FK on triggered_by (kept as a text id, not an FK, so a
// manual tick survives a deleted actor).
export * from "./cron";
