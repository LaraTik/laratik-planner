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
});
