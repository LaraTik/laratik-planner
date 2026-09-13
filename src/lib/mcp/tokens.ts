import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { mcpAccessTokens } from "@/lib/db/schema";

export const MCP_TOKEN_SCOPES = ["content:read", "content:write"] as const;
export type McpTokenScope = (typeof MCP_TOKEN_SCOPES)[number];

const TOKEN_PREFIX = "lpm_";
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function constantTimeTokenHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type IssuedMcpToken = {
  id: string;
  name: string;
  token: string;
  expiresAt: Date;
  scopes: McpTokenScope[];
};

export async function issueMcpAccessToken(input: {
  userId: string;
  name: string;
  scopes: McpTokenScope[];
  expiresAt: Date;
}): Promise<IssuedMcpToken> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) throw new Error("Token name must be 1–100 characters");
  if (input.expiresAt.getTime() <= Date.now())
    throw new Error("Token expiry must be in the future");
  if (input.scopes.length === 0) throw new Error("Select at least one token scope");
  const scopes = Array.from(new Set(input.scopes));
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  const [row] = await db
    .insert(mcpAccessTokens)
    .values({
      userId: input.userId,
      name,
      tokenPrefix: token.slice(0, 12),
      tokenHash: hashToken(token),
      scopes,
      expiresAt: input.expiresAt,
    })
    .returning({
      id: mcpAccessTokens.id,
      name: mcpAccessTokens.name,
      expiresAt: mcpAccessTokens.expiresAt,
    });
  if (!row) throw new Error("Could not create MCP token");
  return { ...row, token, scopes };
}

export async function listMcpAccessTokens(userId: string) {
  return db
    .select({
      id: mcpAccessTokens.id,
      name: mcpAccessTokens.name,
      tokenPrefix: mcpAccessTokens.tokenPrefix,
      scopes: mcpAccessTokens.scopes,
      expiresAt: mcpAccessTokens.expiresAt,
      lastUsedAt: mcpAccessTokens.lastUsedAt,
      revokedAt: mcpAccessTokens.revokedAt,
      createdAt: mcpAccessTokens.createdAt,
    })
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.userId, userId))
    .orderBy(desc(mcpAccessTokens.createdAt));
}

export async function revokeMcpAccessToken(userId: string, tokenId: string): Promise<boolean> {
  const result = await db
    .update(mcpAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpAccessTokens.id, tokenId),
        eq(mcpAccessTokens.userId, userId),
        isNull(mcpAccessTokens.revokedAt),
      ),
    )
    .returning({ id: mcpAccessTokens.id });
  return result.length > 0;
}

export type AuthenticatedMcpToken = {
  id: string;
  userId: string;
  scopes: McpTokenScope[];
};

export async function authenticateMcpToken(
  rawToken: string,
): Promise<AuthenticatedMcpToken | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX) || rawToken.length < 40 || rawToken.length > 80)
    return null;
  const digest = hashToken(rawToken);
  const [candidate] = await db
    .select({
      id: mcpAccessTokens.id,
      userId: mcpAccessTokens.userId,
      tokenHash: mcpAccessTokens.tokenHash,
      scopes: mcpAccessTokens.scopes,
      expiresAt: mcpAccessTokens.expiresAt,
      revokedAt: mcpAccessTokens.revokedAt,
    })
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.tokenHash, digest))
    .limit(1);
  if (!candidate || !constantTimeTokenHashEqual(candidate.tokenHash, digest)) return null;
  if (candidate.revokedAt || candidate.expiresAt.getTime() <= Date.now()) return null;

  // Last-use telemetry is intentionally best-effort. Authentication should
  // never fail because a secondary timestamp update is unavailable.
  void db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpAccessTokens.id, candidate.id))
    .catch(() => undefined);

  return {
    id: candidate.id,
    userId: candidate.userId,
    scopes: candidate.scopes as McpTokenScope[],
  };
}

export async function pruneExpiredMcpAccessTokens(before = new Date()): Promise<number> {
  const rows = await db
    .delete(mcpAccessTokens)
    .where(lt(mcpAccessTokens.expiresAt, before))
    .returning({ id: mcpAccessTokens.id });
  return rows.length;
}
