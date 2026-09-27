import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOKEN_SCOPES } from "@/lib/mcp/tokens";

/**
 * The MCP token issue action is the only place a user can mint a scope, so
 * its input filter is an authorization boundary: whatever it drops is
 * silently replaced by the `content:read` fallback, and whatever it keeps
 * is a real grant.
 *
 * It once hardcoded `content:read | content:write` instead of consulting
 * `MCP_TOKEN_SCOPES`. Every `platform:diagnostics:*` scope the Account UI
 * offers was therefore discarded, the filter came back empty, and the
 * fallback issued a **content** token instead — so the diagnostics MCP
 * tools were unreachable from the product's own UI, and an operator who
 * ticked only the diagnostics boxes received a cross-domain content grant
 * they had never selected.
 *
 * These tests lock the filter to the exported list so the two cannot drift
 * apart again: a scope added to `MCP_TOKEN_SCOPES` (or a checkbox added to
 * the card) is accepted, and an unrecognised value is still rejected.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  issueMcpAccessToken: vi.fn(),
  revokeMcpAccessToken: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth, signOut: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/mcp/tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/tokens")>();
  return {
    ...actual,
    issueMcpAccessToken: mocks.issueMcpAccessToken,
    revokeMcpAccessToken: mocks.revokeMcpAccessToken,
  };
});

const { issueMcpTokenAction } = await import("@/app/(app)/app/account/actions");

/** Build the FormData the Account card submits. */
function form(scopes: string[], extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("mcpTokenName", "ops laptop");
  data.set("mcpTokenDuration", "90");
  for (const scope of scopes) data.append("mcpTokenScope", scope);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

const previous = { errorCode: "none" } as never;

describe("issueMcpTokenAction — scope filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.issueMcpAccessToken.mockResolvedValue({
      token: "lpm_" + "a".repeat(40),
      name: "ops laptop",
      expiresAt: new Date("2026-12-26T00:00:00.000Z"),
    });
  });

  it.each(MCP_TOKEN_SCOPES.map((s) => [s] as const))(
    "accepts the %s scope offered by the Account UI",
    async (scope) => {
      await issueMcpTokenAction(previous, form([scope]));

      expect(mocks.issueMcpAccessToken).toHaveBeenCalledTimes(1);
      expect(mocks.issueMcpAccessToken.mock.calls[0]![0]).toMatchObject({ scopes: [scope] });
    },
  );

  it("keeps a diagnostics-only selection as diagnostics — never a content grant", async () => {
    await issueMcpTokenAction(
      previous,
      form(["platform:diagnostics:read", "platform:diagnostics:write"]),
    );

    const scopes = mocks.issueMcpAccessToken.mock.calls[0]![0].scopes;
    expect(scopes).toEqual(["platform:diagnostics:read", "platform:diagnostics:write"]);
    expect(scopes).not.toContain("content:read");
    expect(scopes).not.toContain("content:write");
  });

  it("accepts every scope at once, including both domains together", async () => {
    await issueMcpTokenAction(previous, form([...MCP_TOKEN_SCOPES]));

    expect(mocks.issueMcpAccessToken.mock.calls[0]![0].scopes).toEqual([...MCP_TOKEN_SCOPES]);
  });

  it("drops an unrecognised scope instead of granting it", async () => {
    await issueMcpTokenAction(previous, form(["content:read", "platform:everything"]));

    expect(mocks.issueMcpAccessToken.mock.calls[0]![0].scopes).toEqual(["content:read"]);
  });

  it("falls back to content:read only when no valid scope was submitted", async () => {
    await issueMcpTokenAction(previous, form(["platform:everything"]));

    expect(mocks.issueMcpAccessToken.mock.calls[0]![0].scopes).toEqual(["content:read"]);
  });

  it("does not mint anything without a session", async () => {
    mocks.auth.mockResolvedValue(null);

    const result = await issueMcpTokenAction(previous, form([...MCP_TOKEN_SCOPES]));

    expect(mocks.issueMcpAccessToken).not.toHaveBeenCalled();
    expect(result).toMatchObject({ errorCode: "sessionExpired" });
  });
});
