import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn } from "./_helpers";
import { users } from "./identity";

/**
 * Personal access credentials for the remote LaraTik Planner MCP endpoint.
 *
 * The plaintext value is returned exactly once at issuance time. Only its
 * SHA-256 digest is stored, so a database read cannot be used as an MCP
 * credential dump. Workspace access is deliberately not stored here: every
 * tool call resolves the requested workspace through the normal policy layer.
 */
export const mcpAccessTokens = pgTable(
  "mcp_access_token",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`ARRAY['content:read']::text[]`),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("mcp_access_token_hash_unique").on(t.tokenHash),
    index("mcp_access_token_user_idx").on(t.userId, t.createdAt),
    check("mcp_access_token_name_length", sql`length(trim(${t.name})) BETWEEN 1 AND 100`),
    check("mcp_access_token_prefix_length", sql`length(${t.tokenPrefix}) BETWEEN 8 AND 24`),
    check("mcp_access_token_expiry_valid", sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      "mcp_access_token_scopes_valid",
      sql`${t.scopes} <@ ARRAY['content:read', 'content:write']::text[] AND cardinality(${t.scopes}) > 0`,
    ),
  ],
);

export type McpAccessToken = typeof mcpAccessTokens.$inferSelect;
