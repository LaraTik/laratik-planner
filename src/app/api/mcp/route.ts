import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpToken } from "@/lib/mcp/tokens";
import { createLaraTikPlannerMcpServer } from "@/lib/mcp/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/validation/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_RESOURCE = "https://planner.laratik.com/api/mcp";

function unauthorized() {
  return new NextResponse(JSON.stringify({ error: "MCP authentication required" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer error="invalid_token"',
    },
  });
}

function allowedHost(request: Request): boolean {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0];
  if (serverEnv.NODE_ENV !== "production") return host === "localhost" || host === "127.0.0.1";
  return host === "planner.laratik.com";
}

function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(MCP_RESOURCE).origin;
  } catch {
    return false;
  }
}

async function post(request: Request) {
  if (!allowedHost(request) || !allowedOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const header = request.headers.get("authorization") ?? "";
  const rawToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = await authenticateMcpToken(rawToken);
  if (!token) return unauthorized();

  const limit = await enforceRateLimit({
    scope: "mcp_request",
    subject: token.id,
    actorId: token.userId,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "MCP rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const server = createLaraTikPlannerMcpServer({
    actor: { id: token.userId },
    scopes: token.scopes,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, {
      authInfo: { token: rawToken, clientId: "mcp-access-token", scopes: token.scopes },
    });
  } catch {
    return NextResponse.json({ error: "MCP request could not be processed" }, { status: 500 });
  } finally {
    await server.close().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  return post(request);
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with an MCP JSON-RPC request" },
    { status: 405, headers: { allow: "POST" } },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Stateless MCP sessions do not support DELETE" },
    { status: 405, headers: { allow: "POST" } },
  );
}
