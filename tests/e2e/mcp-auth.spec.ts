import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("remote MCP transport", () => {
  test("does not depend on an Auth.js browser session", async ({ request }) => {
    const response = await request.post("/api/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(401);
    expect(response.headers().location).toBeUndefined();
    expect(response.headers()["www-authenticate"]).toContain("Bearer");
  });

  test("advertises POST-only stateless transport", async ({ request }) => {
    const response = await request.get("/api/mcp", { maxRedirects: 0 });
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe("POST");
  });

  /**
   * The diagnostics scopes are refused at the route boundary for a token
   * that does not carry them, and — more importantly — refused for a token
   * that *does* carry the scope when the actor is not a platform admin.
   * The second case is the cross-tenant guard: `app_error_event` holds
   * routes, messages, and actor ids from every workspace, so the scope
   * alone must never be sufficient.
   *
   * The tool-level gate is covered exhaustively in
   * `tests/unit/mcp-diagnostics-tools.test.ts`; this spec proves the
   * failure surfaces as a proper MCP error at the HTTP boundary rather
   * than a transport error.
   */
  test("refuses a diagnostics tool for a token without the scope", async ({ request }) => {
    const token = process.env.MCP_ACCESS_TOKEN;
    test.skip(!token, "MCP_ACCESS_TOKEN is required for the authenticated MCP checks");

    const response = await request.post("/api/mcp", {
      headers: { authorization: `Bearer ${token}` },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "laratik_planner_app_health",
          arguments: {},
        },
      },
      maxRedirects: 0,
    });

    // A content-only token authenticates fine (200) but the tool call is
    // rejected with a scope error inside the result payload.
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text ?? "").toContain("platform:diagnostics");
  });
});
