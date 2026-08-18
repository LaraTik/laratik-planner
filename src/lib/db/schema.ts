/**
 * Drizzle schema — populated in Goal 1 (database foundation, tenancy, RLS).
 *
 * Goal 0 leaves this empty so the build, type-check, and migration commands
 * all pass before the first table is added. See STUDIOFLOW_MASTER_PROMPT.md §8
 * for the full list of tables, enums, and invariants to port.
 *
 * Drizzle convention: every mutable business table has created_at, updated_at,
 * and (where relevant) archived_at. Use uuid() for PKs, timestamp() with
 * timezone: true for all time fields, all timestamps in UTC.
 */

// Re-export the empty schema so drizzle-kit has a valid schema file.
export const schema = {};
