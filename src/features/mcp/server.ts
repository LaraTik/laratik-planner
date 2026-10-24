import "server-only";

import { eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { canAccessInternalWorkspace, PermissionDeniedError } from "@/lib/auth/policy";
import { DomainError } from "@/lib/content/workflow";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";
import { registerDiagnosticTools } from "@/features/mcp/diagnostic-tools";
import { registerBrandKitTools } from "@/features/mcp/brand-kit-tools";
import { registerTaskTools } from "@/features/mcp/task-tools";
import { registerContentTools } from "@/features/mcp/content-tools";
import {
  registerWorkspaceDirectoryTools,
  registerWorkspaceWorkflowTools,
} from "@/features/mcp/workspace-tools";
import { registerResearchTools } from "@/features/mcp/research-tools";
import { registerSocialAnalyticsTools } from "@/features/mcp/social-tools";
import type { McpContext } from "@/features/mcp/tool-contracts";

const workspaceId = z.string().guid().describe("Exact workspace UUID returned by list_workspaces.");
const contentItemId = z.string().guid().describe("Exact content item UUID.");
const agencyId = z.string().guid().describe("Exact agency UUID returned by list_agencies.");
const taskId = z.string().guid().describe("Exact agency task UUID.");
const responseFormat = z.enum(["json", "markdown"]).default("json");

export class McpToolError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "invalid_request" | "scope_required",
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

function requireScope(context: McpContext, scope: McpTokenScope) {
  const allowed =
    context.scopes.includes(scope) ||
    (scope === "content:read" && context.scopes.includes("content:write"));
  if (!allowed) {
    throw new McpToolError("scope_required", `This operation requires the ${scope} scope.`);
  }
}

/**
 * Two-gate authorization for the error-diagnostics tools.
 *
 * The scope alone is **not** sufficient, and that is the whole point of
 * this helper. `app_error_event` holds routes, scrubbed messages, stacks,
 * and actor ids from *every* tenant, so a token scoped
 * `platform:diagnostics:read` but held by an ordinary workspace member
 * would otherwise be able to read another agency's failures. Every
 * diagnostics tool therefore requires the scope **and** the
 * `platform.console.read` platform permission — the same gate the
 * `/app/platform/errors` console page uses.
 *
 * Note the asymmetry with `requireScope`: `content:write` implies
 * `content:read`, and `platform:diagnostics:write` implies
 * `platform:diagnostics:read`, but nothing crosses between the `content`
 * and `platform:diagnostics` domains in either direction. They are
 * unrelated privilege domains and must not be conflated.
 */
async function requireDiagnosticsAccess(
  context: McpContext,
  scope: "platform:diagnostics:read" | "platform:diagnostics:write",
) {
  if (scope === "platform:diagnostics:read") {
    const allowed =
      context.scopes.includes("platform:diagnostics:read") ||
      context.scopes.includes("platform:diagnostics:write");
    if (!allowed) {
      throw new McpToolError(
        "scope_required",
        "This operation requires the platform:diagnostics:read scope.",
      );
    }
  } else {
    requireScope(context, scope);
  }
  const { hasPlatformPermission } = await import("@/lib/auth/platform-access");
  if (!(await hasPlatformPermission(context.actor, "platform.console.read"))) {
    throw new PermissionDeniedError("platform.console.read");
  }
}

async function requireWorkspace(context: McpContext, id: string) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      agencyId: workspaces.agencyId,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
      status: workspaces.status,
    })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!workspace || workspace.status !== "active") {
    throw new McpToolError("not_found", "Workspace not found.");
  }
  if (!(await canAccessInternalWorkspace(context.actor, workspace.id))) {
    throw new McpToolError("not_found", "Workspace not found.");
  }
  return workspace;
}

function serialise<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function markdown(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0
      ? "No results."
      : value.map((row) => `- ${JSON.stringify(row)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) => `- **${key}**: ${typeof item === "string" ? item : JSON.stringify(item)}`,
      )
      .join("\n");
  }
  return String(value ?? "");
}

function result(value: unknown, format: "json" | "markdown") {
  const serialised = serialise(value);
  return {
    content: [
      {
        type: "text" as const,
        text: format === "markdown" ? markdown(serialised) : JSON.stringify(serialised),
      },
    ],
    structuredContent: { result: serialised },
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof McpToolError || error instanceof DomainError
      ? error.message
      : error instanceof PermissionDeniedError
        ? "You do not have permission to perform this operation."
        : "The planner could not complete this operation.";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

// ─── Brand-kit helpers (M5.5) ───────────────────────────────────────────────
//
export function createLaraTikPlannerMcpServer(context: McpContext) {
  const server = new McpServer(
    { name: "laratik-planner", version: "1.0.0" },
    {
      instructions:
        "LaraTik Planner exposes the authenticated user's internal planning workspace and agency task list. Call list_agencies before agency-scoped task operations, call list_workspaces before workspace-scoped operations, and prefer read tools before changing data. Write operations are subject to the planner's existing agency, workspace, role, and workflow rules.",
    },
  );

  const workspaceToolDependencies = {
    workspaceId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  };

  registerWorkspaceDirectoryTools(server, context, workspaceToolDependencies);

  registerTaskTools(server, context, {
    agencyId,
    taskId,
    responseFormat,
    requireScope,
    result,
    errorResult,
    McpToolError,
  });

  registerSocialAnalyticsTools(server, context, workspaceToolDependencies);

  registerWorkspaceWorkflowTools(server, context, workspaceToolDependencies);

  registerResearchTools(server, context, {
    workspaceId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  });

  registerContentTools(server, context, {
    workspaceId,
    contentItemId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  });

  registerBrandKitTools(server, context, {
    workspaceId,
    responseFormat,
    requireWorkspace,
    requireScope,
    result,
    errorResult,
    McpToolError,
  });

  registerDiagnosticTools(server, context, {
    responseFormat,
    requireDiagnosticsAccess,
    result,
    errorResult,
    McpToolError,
  });

  return server;
}
