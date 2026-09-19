import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  brandAssets,
  contentItems,
  workspaces,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema";
import { canAccessInternalWorkspace, PermissionDeniedError, type Actor } from "@/lib/auth/policy";
import {
  archiveContentItem,
  assignContentOwner,
  getContentItem,
  listWorkspaceContent,
  quickCreateContentItem,
  rescheduleContentItem,
  transitionContent,
  updateContentItem,
} from "@/lib/content/service";
import { duplicateContentItem } from "@/lib/planning/content-clone";
import { DomainError, WORKFLOW_SCENARIOS } from "@/lib/content/workflow";
import {
  createBrandAsset,
  createBrandLinkedResource,
  createBrandPublishingRule,
  createBrandVoiceRule,
  createColorAsset,
  createFontAsset,
  createLogoAsset,
  listBrandAssets,
  listBrandLinkedResources,
  listBrandPublishingRules,
  listBrandVoiceRules,
  listContentPillars,
} from "@/lib/brand/service";
import type {
  BrandLinkedResourceCommand,
  BrandPublishingRuleCommand,
  BrandVoiceRuleCommand,
} from "@/lib/brand/command";
import { writeFile as storageWriteFile, getSignedDownloadUrl } from "@/lib/storage";
import type { McpTokenScope } from "./tokens";
import { z } from "zod";

const CONTENT_FORMATS = [
  "static_post",
  "carousel",
  "story",
  "short_form_video",
  "long_form_video",
  "live_content",
  "article",
  "other",
] as const;

const WORKFLOW_ACTIONS = [
  "submit_content_review",
  "approve_content",
  "request_content_changes",
  "resubmit_content",
  "assign_designer",
  "submit_delivery",
  "approve_internal_creative",
  "request_creative_changes",
  "approve_client_creative",
  "record_published",
  "cancel",
  "block",
  "unblock",
] as const;
const CONTENT_STATUSES = [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
  "changes_requested",
  "blocked",
  "cancelled",
] as const;

const workspaceId = z.string().uuid().describe("Exact workspace UUID returned by list_workspaces.");
const contentItemId = z.string().uuid().describe("Exact content item UUID.");
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

type McpContext = { actor: Actor; scopes: McpTokenScope[] };

function requireScope(context: McpContext, scope: McpTokenScope) {
  const allowed =
    context.scopes.includes(scope) ||
    (scope === "content:read" && context.scopes.includes("content:write"));
  if (!allowed) {
    throw new McpToolError("scope_required", `This operation requires the ${scope} scope.`);
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

function safeItem(item: typeof contentItems.$inferSelect) {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    title: item.title,
    format: item.format,
    brief: item.brief,
    plannedPublishAt: item.plannedPublishAt,
    status: item.status,
    priority: item.priority,
    contentOwnerId: item.contentOwnerId,
    designerId: item.designerId,
    contentReviewerId: item.contentReviewerId,
    internalCreativeReviewerId: item.internalCreativeReviewerId,
    clientReviewerId: item.clientReviewerId,
    revision: item.revision,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// ─── Brand-kit helpers (M5.5) ───────────────────────────────────────────────
//
// Two MCP tools (`export_brand_kit`, `import_brand_kit`) round-trip a
// brand-kit between two LaraTik Planner instances. The same workspace
// is not the source and the target in the same call. Helpers below
// keep the wire format consistent across the two tools: a JSON
// envelope carrying asset/rule metadata + short-lived signed logo
// download URLs. The maintenance contract forbids raw file access in
// the MCP surface; logo binaries move via signed download URLs rather
// than as opaque MCP primitives.
const BRAND_COLOR_ROLES = ["primary", "secondary", "accent", "neutral"] as const;
const BRAND_FONT_ROLES = ["headline", "body", "accent", "mono"] as const;
const BRAND_PUBLISHING_RULE_TYPES = [
  "alt_text",
  "hashtag",
  "compliance",
  "channel",
  "general",
] as const;
const BRAND_LINKED_RESOURCE_PROVIDERS = [
  "google_drive",
  "figma",
  "canva",
  "dropbox",
  "other",
] as const;
const LOGO_MAX_BYTES = 10 * 1024 * 1024;

const brandKitConflictStrategies = ["fail", "merge", "overwrite"] as const;
type BrandKitConflictStrategy = (typeof brandKitConflictStrategies)[number];

function publicAppUrl(): string {
  // Prefer the operator-set URL so prod exports resolve against the
  // public host. Falls back to localhost so dev works without
  // configuration; an explicitly empty value is treated as "use the
  // default" rather than throwing — MCP exports should never 500 on
  // a missing env var.
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function logoDownloadUrl(storagePath: string): string {
  // Reuse the storage helper so the token format and the
  // workspace/fileId encoding stay identical to what the UI signs.
  // The relative path becomes absolute against the public app URL
  // so the export envelope is self-contained.
  const base = publicAppUrl().replace(/\/$/, "");
  return `${base}${getSignedDownloadUrl(storagePath)}`;
}

async function fetchLogoBuffer(sourceUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(sourceUrl, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      throw new McpToolError(
        "invalid_request",
        `Logo source fetch returned HTTP ${res.status} ${res.statusText}.`,
      );
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const declared = res.headers.get("content-length");
    if (declared && Number(declared) > LOGO_MAX_BYTES) {
      throw new McpToolError(
        "invalid_request",
        `Logo source exceeds the 10 MB cap (${declared} bytes).`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > LOGO_MAX_BYTES) {
      throw new McpToolError(
        "invalid_request",
        `Logo source exceeds the 10 MB cap (${arrayBuffer.byteLength} bytes).`,
      );
    }
    return { buffer: Buffer.from(arrayBuffer), mimeType: contentType };
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    throw new McpToolError(
      "invalid_request",
      `Logo source fetch failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function decodeLogoBase64(base64: string): Buffer {
  const trimmed = base64.trim();
  // Accept both raw base64 and the data-URL wrapper that some
  // upstream clients emit (`data:image/png;base64,…`).
  const payload = trimmed.startsWith("data:") ? (trimmed.split(",", 2)[1] ?? "") : trimmed;
  if (!payload) {
    throw new McpToolError("invalid_request", "Logo base64 payload is empty.");
  }
  const buffer = Buffer.from(payload, "base64");
  if (buffer.byteLength === 0) {
    throw new McpToolError("invalid_request", "Logo base64 payload did not decode.");
  }
  if (buffer.byteLength > LOGO_MAX_BYTES) {
    throw new McpToolError(
      "invalid_request",
      `Logo exceeds the 10 MB cap (${buffer.byteLength} bytes).`,
    );
  }
  return buffer;
}

type BrandKitNameSet = {
  logos: Set<string>;
  colors: Set<string>;
  fonts: Set<string>;
  otherAssets: Set<string>;
  voiceRules: Set<string>;
  publishingRules: Set<string>;
  linkedResources: Set<string>;
};

async function loadBrandKitNameSet(workspaceId: string): Promise<BrandKitNameSet> {
  const [assets, rules, publishing, resources] = await Promise.all([
    listBrandAssets(workspaceId, { includeArchived: false }),
    listBrandVoiceRules(workspaceId, { includeArchived: false }),
    listBrandPublishingRules(workspaceId, { includeArchived: false }),
    listBrandLinkedResources(workspaceId, { includeArchived: false }),
  ]);
  const logos = new Set<string>();
  const colors = new Set<string>();
  const fonts = new Set<string>();
  const otherAssets = new Set<string>();
  for (const asset of assets) {
    if (asset.kind === "logo") logos.add(asset.name);
    else if (asset.kind === "color") colors.add(asset.name);
    else if (asset.kind === "font") fonts.add(asset.name);
    else if (asset.kind === "guideline" || asset.kind === "reference" || asset.kind === "other") {
      otherAssets.add(`${asset.kind}:${asset.name}`);
    }
  }
  const voiceRules = new Set<string>(rules.map((rule) => `${rule.ruleType}:${rule.content}`));
  const publishingRules = new Set<string>(
    publishing.map((rule) => `${rule.ruleType}:${rule.title}`),
  );
  const linkedResources = new Set<string>(resources.map((resource) => resource.url));
  return { logos, colors, fonts, otherAssets, voiceRules, publishingRules, linkedResources };
}

async function importLogo(
  actor: Actor,
  workspaceId: string,
  input: {
    name: string;
    externalUrl?: string;
    sourceUrl?: string;
    base64?: string;
    ext: string;
  },
): Promise<void> {
  // Exactly one of: externalUrl (just record the URL), source_url
  // (fetch + persist), or base64 (decode + persist).
  if (input.externalUrl) {
    await createLogoAsset(actor, workspaceId, {
      name: input.name,
      externalUrl: input.externalUrl,
    });
    return;
  }
  let buffer: Buffer;
  if (input.sourceUrl) {
    const fetched = await fetchLogoBuffer(input.sourceUrl);
    buffer = fetched.buffer;
  } else if (input.base64) {
    buffer = decodeLogoBase64(input.base64);
  } else {
    throw new McpToolError(
      "invalid_request",
      `Logo "${input.name}" needs externalUrl, source_url, or base64.`,
    );
  }
  const written = await storageWriteFile(workspaceId, "logo", input.ext, buffer);
  await createLogoAsset(actor, workspaceId, {
    name: input.name,
    storagePath: written.storagePath,
  });
}

export function createLaraTikPlannerMcpServer(context: McpContext) {
  const server = new McpServer(
    { name: "laratik-planner", version: "1.0.0" },
    {
      instructions:
        "LaraTik Planner exposes the authenticated user's internal planning workspace. Always call list_workspaces first, use the exact workspace UUID, and prefer list_content before changing an item. Write operations are subject to the planner's existing role and workflow rules.",
    },
  );

  server.registerTool(
    "laratik_planner_list_workspaces",
    {
      title: "List accessible workspaces",
      description:
        "List active internal workspaces the authenticated user can access. Pass `name_query` (case-insensitive substring, 1-120 chars) to filter by name or slug — useful for resolving a specific workspace UUID without paging through the full list. Empty/missing filter returns every accessible workspace, capped at 200.",
      inputSchema: z.object({
        name_query: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe(
            "Case-insensitive substring match against workspace.name or workspace.slug. Trimmed before matching. Returns matching workspaces only.",
          ),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name_query, response_format }) => {
      try {
        const trimmed = name_query?.trim();
        if (trimmed && (trimmed.length < 1 || trimmed.length > 120)) {
          throw new McpToolError(
            "invalid_request",
            "name_query must be 1-120 characters after trimming.",
          );
        }
        const memberships = await db
          .select({
            agencyId: agencyMemberships.agencyId,
            isAgencyAdmin: agencyMemberships.isAgencyAdmin,
          })
          .from(agencyMemberships)
          .where(
            and(
              eq(agencyMemberships.userId, context.actor.id),
              eq(agencyMemberships.status, "active"),
            ),
          );
        const agencyIds = memberships.map((membership) => membership.agencyId);
        if (agencyIds.length === 0) return result([], response_format);
        const baseQuery = db
          .select({
            id: workspaces.id,
            agencyId: workspaces.agencyId,
            agencyName: agencies.name,
            name: workspaces.name,
            slug: workspaces.slug,
            timezone: workspaces.timezone,
          })
          .from(workspaces)
          .innerJoin(agencies, eq(agencies.id, workspaces.agencyId));
        const whereClauses = [
          eq(workspaces.status, "active"),
          isNull(agencies.archivedAt),
          isNull(agencies.suspendedAt),
        ];
        if (trimmed) {
          // Postgres ILIKE on both name + slug keeps the filter cheap and
          // forgiving for callers who type partial Arabic, mixed casing,
          // or only remember the slug. Escape any user-controlled LIKE
          // wildcards (%, _) so callers can't widen the match accidentally.
          const safe = trimmed.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
          const pattern = `%${safe}%`;
          whereClauses.push(
            sql`(${workspaces.name} ILIKE ${pattern} ESCAPE '\\' OR ${workspaces.slug} ILIKE ${pattern} ESCAPE '\\')`,
          );
        }
        const rows = await baseQuery.where(and(...whereClauses)).limit(200);
        const allowed = [];
        for (const row of rows.filter((row) => agencyIds.includes(row.agencyId))) {
          if (await canAccessInternalWorkspace(context.actor, row.id)) allowed.push(row);
        }
        return result(allowed, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_get_workspace_settings",
    {
      title: "Get workspace settings",
      description:
        "Read the workspace's active workflow scenario, approval mode, lead times, and monthly target. Use this to confirm which spine a workspace is running before proposing transitions.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workspace_id, response_format }) => {
      try {
        requireScope(context, "content:read");
        if (!(await canAccessInternalWorkspace(context.actor, workspace_id))) {
          return errorResult(new PermissionDeniedError("read workspace settings"));
        }
        const { getAccessibleWorkspace } = await import("@/lib/workspaces/context");
        const workspace = await getAccessibleWorkspace(context.actor, workspace_id);
        if (!workspace) {
          return errorResult(new Error("Workspace not found"));
        }
        const [row] = await db
          .select({
            workflowScenario: workspaceSettingsTable.workflowScenario,
            approvalMode: workspaceSettingsTable.approvalMode,
            contentApprovalLeadDays: workspaceSettingsTable.contentApprovalLeadDays,
            designCompleteLeadDays: workspaceSettingsTable.designCompleteLeadDays,
            creativeApprovalLeadDays: workspaceSettingsTable.creativeApprovalLeadDays,
            readyToPublishLeadDays: workspaceSettingsTable.readyToPublishLeadDays,
            monthlyTarget: workspaceSettingsTable.monthlyTarget,
            metaPublishingEnabled: workspaceSettingsTable.metaPublishingEnabled,
          })
          .from(workspaceSettingsTable)
          .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
          .limit(1);
        const scenarioId = (row?.workflowScenario ?? "standard") as
          "standard" | "lightweight" | "two_gate_client" | "self_publish";
        const catalog = WORKFLOW_SCENARIOS[scenarioId];
        const payload = {
          workspace_id: workspace.id,
          slug: workspace.slug,
          workflow_scenario: {
            id: scenarioId,
            name_key: `contentDetail.workflow.scenario.${scenarioId.replace(/_/g, "")}.name`,
            stages: catalog?.stages ?? WORKFLOW_SCENARIOS.standard.stages,
            approval_mode_forced: catalog?.approvalMode ?? null,
            publishing_setup_required: catalog?.publishingSetupRequired ?? true,
          },
          approval_mode: row?.approvalMode ?? "simple",
          lead_days: {
            content_approval: row?.contentApprovalLeadDays ?? 10,
            design_complete: row?.designCompleteLeadDays ?? 5,
            creative_approval: row?.creativeApprovalLeadDays ?? 0,
            ready_to_publish: row?.readyToPublishLeadDays ?? 3,
          },
          monthly_target: row?.monthlyTarget ?? null,
          meta_publishing_enabled: row?.metaPublishingEnabled ?? false,
        };
        return result(payload, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_apply_workflow_scenario",
    {
      title: "Apply workflow scenario",
      description:
        "Apply one of the pre-defined workflow scenarios to the workspace. Manager-only. Scenarios are reversible; in-flight items keep their current state. Side effects: may force approval_mode to match the scenario's contract.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        scenario_id: z.enum(["standard", "lightweight", "two_gate_client", "self_publish"]),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ workspace_id, scenario_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        // Reuse the same permission gate as the Settings UI to
        // avoid duplicating role checks across the MCP surface.
        const { applyWorkflowScenarioAction } =
          await import("@/app/(app)/app/w/[slug]/settings/templates-actions");
        const { getAccessibleWorkspace } = await import("@/lib/workspaces/context");
        const ws = await getAccessibleWorkspace(context.actor, workspace_id);
        if (!ws) return errorResult(new Error("Workspace not found"));
        const outcome = await applyWorkflowScenarioAction(ws.slug, scenario_id);
        if (!outcome.ok) return errorResult(new Error(outcome.error ?? "could not apply scenario"));
        return result(
          {
            workspace_id: ws.id,
            scenario_id,
            ...(outcome.forcedApprovalMode
              ? { forced_approval_mode: outcome.forcedApprovalMode }
              : {}),
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_list_content",
    {
      title: "List planning content",
      description:
        "List non-archived content items in one accessible workspace with stable pagination and filters.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        month_start: z.coerce.date().optional(),
        month_end: z.coerce.date().optional(),
        status: z.enum(CONTENT_STATUSES).optional(),
        search: z.string().max(200).optional(),
        owner_id: z.string().uuid().optional(),
        format: z.enum(CONTENT_FORMATS).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        await requireWorkspace(context, input.workspace_id);
        const rows = await listWorkspaceContent(context.actor, input.workspace_id, {
          ...(input.month_start ? { monthStart: input.month_start } : {}),
          ...(input.month_end ? { monthEnd: input.month_end } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.search ? { search: input.search } : {}),
          ...(input.owner_id ? { ownerId: input.owner_id } : {}),
          ...(input.format ? { format: input.format } : {}),
          limit: input.limit,
          offset: input.offset,
        });
        return result(
          {
            items: rows.map(safeItem),
            limit: input.limit,
            offset: input.offset,
            has_more: rows.length === input.limit,
          },
          input.response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_get_content",
    {
      title: "Get planning content",
      description: "Read one internal content item, its selected channels, and assignment history.",
      inputSchema: z.object({ content_item_id: contentItemId, response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ content_item_id, response_format }) => {
      try {
        const item = await getContentItem(context.actor, content_item_id);
        if (!item) throw new McpToolError("not_found", "Content item not found.");
        return result(item, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_create_content",
    {
      title: "Create planning content",
      description:
        "Create one draft content item using the planner's Quick Create validation and default channel selection.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        title: z.string().min(2).max(200),
        format: z.enum(CONTENT_FORMATS),
        brief: z.string().max(2000).default(""),
        planned_publish_at: z.coerce.date(),
        channel_ids: z.array(z.string().uuid()).max(100).optional(),
        format_payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Optional format-specific creative fields. The planner validates and normalizes this payload against the selected format.",
          ),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        await requireWorkspace(context, input.workspace_id);
        const id = await quickCreateContentItem(context.actor, {
          workspaceId: input.workspace_id,
          title: input.title,
          format: input.format,
          brief: input.brief,
          plannedPublishAt: input.planned_publish_at,
          channelIds: input.channel_ids,
          ...(input.format_payload !== undefined ? { formatPayload: input.format_payload } : {}),
        });
        return result(
          { id, status: "draft", format_payload_written: input.format_payload !== undefined },
          input.response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_update_content",
    {
      title: "Update planning content",
      description:
        "Update an editable draft or changes-requested item. Existing workflow editability rules remain enforced.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        title: z.string().min(2).max(200),
        format: z.enum(CONTENT_FORMATS),
        brief: z.string().max(2000).default(""),
        planned_publish_at: z.coerce.date(),
        channel_ids: z.array(z.string().uuid()).max(100).optional(),
        format_payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Optional complete format-specific creative payload. It is revalidated against the item's selected format.",
          ),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        await updateContentItem(context.actor, {
          contentItemId: input.content_item_id,
          title: input.title,
          format: input.format,
          brief: input.brief,
          plannedPublishAt: input.planned_publish_at,
          channelIds: input.channel_ids,
          ...(input.format_payload !== undefined ? { formatPayload: input.format_payload } : {}),
        });
        return result(
          {
            id: input.content_item_id,
            updated: true,
            format_payload_written: input.format_payload !== undefined,
          },
          input.response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_reschedule_content",
    {
      title: "Reschedule content",
      description:
        "Change only the planned publish date for an accessible item; useful when the calendar edit affordance is hard to find.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        planned_publish_at: z.coerce.date(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, planned_publish_at, response_format }) => {
      try {
        requireScope(context, "content:write");
        await rescheduleContentItem(context.actor, {
          contentItemId: content_item_id,
          plannedPublishAt: planned_publish_at,
        });
        return result({ id: content_item_id, planned_publish_at }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_change_owner",
    {
      title: "Change content owner",
      description:
        "Reassign the coordinating owner to an eligible internal workspace member without changing workflow stage.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        owner_id: z.string().uuid(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, owner_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        await assignContentOwner(context.actor, {
          contentItemId: content_item_id,
          ownerId: owner_id,
        });
        return result({ id: content_item_id, owner_id, updated: true }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_transition_content",
    {
      title: "Advance workflow item",
      description:
        "Run one explicit workflow action through the planner state machine. Invalid transitions and role restrictions are rejected. Transitions that target a stage excluded by the workspace's active scenario are also rejected; call laratik_planner_get_workspace_settings first if the spine is unclear.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        action: z.enum(WORKFLOW_ACTIONS),
        reason: z.string().max(2000).optional(),
        return_target: z.string().max(40).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, action, reason, return_target, response_format }) => {
      try {
        requireScope(context, "content:write");
        const transition = await transitionContent(context.actor, {
          contentItemId: content_item_id,
          action,
          ...(reason ? { reason } : {}),
          ...(return_target ? { returnTarget: return_target } : {}),
        });
        return result({ id: content_item_id, ...transition }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_archive_content",
    {
      title: "Archive content",
      description:
        "Soft-archive one content item. This requires an explicit confirm=true and cannot be undone through this MCP surface.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        confirm: z.literal(true),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        const item = await getContentItem(context.actor, content_item_id);
        if (!item) throw new McpToolError("not_found", "Content item not found.");
        await archiveContentItem(context.actor, {
          workspaceId: item.workspaceId,
          contentItemId: content_item_id,
        });
        return result({ id: content_item_id, archived: true }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_duplicate_content",
    {
      title: "Duplicate content",
      description:
        "Create a new draft copy of an existing content item, optionally with a new publish date or format.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        planned_publish_at: z.coerce.date().nullable().optional(),
        format: z.enum(CONTENT_FORMATS).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, planned_publish_at, format, response_format }) => {
      try {
        requireScope(context, "content:write");
        const copy = await duplicateContentItem(context.actor, content_item_id, {
          ...(planned_publish_at !== undefined ? { plannedPublishAt: planned_publish_at } : {}),
          ...(format ? { format } : {}),
        });
        return result(copy, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_export_brand_kit",
    {
      title: "Export brand kit",
      description:
        "Read the full brand-kit for an accessible workspace — logos, colors, fonts, voice rules, publishing rules, linked resources, content pillars. Returns a JSON envelope; logo binaries are referenced via short-lived signed download URLs so the same envelope can be fed straight into laratik_planner_import_brand_kit on another instance. Logos without a storage_path (external URL only) keep their original URL.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        include_archived: z.boolean().default(false),
        include_logo_urls: z.boolean().default(true),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        await requireWorkspace(context, input.workspace_id);
        const [assets, voiceRules, publishingRules, linkedResources, pillars] = await Promise.all([
          listBrandAssets(input.workspace_id, { includeArchived: input.include_archived }),
          listBrandVoiceRules(input.workspace_id, { includeArchived: input.include_archived }),
          listBrandPublishingRules(input.workspace_id, { includeArchived: input.include_archived }),
          listBrandLinkedResources(input.workspace_id, { includeArchived: input.include_archived }),
          listContentPillars(input.workspace_id),
        ]);

        const logos = assets
          .filter((asset) => asset.kind === "logo")
          .map((asset) => ({
            id: asset.id,
            name: asset.name,
            external_url: asset.externalUrl,
            storage_path: asset.storagePath,
            storage_object_id: asset.storageObjectId,
            download_url:
              input.include_logo_urls && asset.storagePath
                ? logoDownloadUrl(asset.storagePath)
                : null,
            archived_at: asset.archivedAt,
          }));
        const colors = assets
          .filter((asset) => asset.kind === "color")
          .map((asset) => ({
            id: asset.id,
            name: asset.name,
            hex:
              typeof asset.value === "object" && asset.value && "hex" in asset.value
                ? String((asset.value as { hex: unknown }).hex)
                : null,
            color_role: asset.colorRole,
            archived_at: asset.archivedAt,
          }));
        const fonts = assets
          .filter((asset) => asset.kind === "font")
          .map((asset) => {
            const value =
              typeof asset.value === "object" && asset.value
                ? (asset.value as Record<string, unknown>)
                : {};
            return {
              id: asset.id,
              name: asset.name,
              family: typeof value.family === "string" ? value.family : null,
              weight: typeof value.weight === "number" ? value.weight : null,
              role: typeof value.role === "string" ? value.role : null,
              archived_at: asset.archivedAt,
            };
          });
        const other = assets
          .filter((asset) => !["logo", "color", "font"].includes(asset.kind))
          .map((asset) => ({
            id: asset.id,
            kind: asset.kind,
            name: asset.name,
            value: asset.value,
            external_url: asset.externalUrl,
            storage_path: asset.storagePath,
            archived_at: asset.archivedAt,
          }));

        return result(
          {
            workspace_id: input.workspace_id,
            brand_assets: { logos, colors, fonts, other },
            voice_rules: voiceRules.map((rule) => ({
              id: rule.id,
              rule_type: rule.ruleType,
              content: rule.content,
              archived_at: rule.archivedAt,
            })),
            publishing_rules: publishingRules.map((rule) => ({
              id: rule.id,
              rule_type: rule.ruleType,
              title: rule.title,
              content: rule.content,
              archived_at: rule.archivedAt,
            })),
            linked_resources: linkedResources.map((resource) => ({
              id: resource.id,
              provider: resource.provider,
              name: resource.name,
              url: resource.url,
              description: resource.description,
              archived_at: resource.archivedAt,
            })),
            content_pillars: pillars,
          },
          input.response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_import_brand_kit",
    {
      title: "Import brand kit",
      description:
        "Apply a brand-kit envelope (typically from laratik_planner_export_brand_kit on another instance) to an accessible workspace. Supports conflict_strategy='merge' (skip duplicates — the default), 'fail' (reject on first duplicate), and 'overwrite' (archive duplicates; requires confirm=true). Logo binaries can be supplied as base64 inline, fetched from a source_url, or referenced by externalUrl (no binary fetched). All create_* helpers re-enforce the existing workspace_manager role check, so the token owner must already be a workspace manager on the target.",
      inputSchema: z
        .object({
          workspace_id: workspaceId,
          conflict_strategy: z.enum(brandKitConflictStrategies).default("merge"),
          confirm: z.boolean().optional(),
          logos: z
            .array(
              z
                .object({
                  name: z.string().trim().min(1).max(120),
                  external_url: z
                    .string()
                    .url()
                    .refine((value) => value.startsWith("https://"), "Use HTTPS")
                    .optional(),
                  source_url: z
                    .string()
                    .url()
                    .refine((value) => value.startsWith("https://"), "Use HTTPS")
                    .optional(),
                  base64: z
                    .string()
                    .min(1)
                    .max(14 * 1024 * 1024)
                    .optional(),
                  mime_type: z.string().min(1).max(120),
                  ext: z.string().min(1).max(8),
                })
                .refine(
                  (value) => {
                    const provided = [value.external_url, value.source_url, value.base64].filter(
                      Boolean,
                    ).length;
                    return provided === 1;
                  },
                  { message: "Provide exactly one of external_url, source_url, or base64." },
                ),
            )
            .max(50)
            .default([]),
          colors: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(80),
                hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use #RRGGBB format"),
                color_role: z.enum(BRAND_COLOR_ROLES).optional(),
              }),
            )
            .max(200)
            .default([]),
          fonts: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(80),
                family: z.string().trim().min(1).max(120),
                weight: z.number().int().min(100).max(900),
                role: z.enum(BRAND_FONT_ROLES),
              }),
            )
            .max(50)
            .default([]),
          other_assets: z
            .array(
              z
                .object({
                  kind: z.enum(["guideline", "reference", "other"]),
                  name: z.string().trim().min(1).max(120),
                  value: z.record(z.string(), z.unknown()).optional(),
                  external_url: z
                    .string()
                    .url()
                    .refine((value) => value.startsWith("https://"), "Use HTTPS")
                    .optional(),
                  storage_path: z.string().trim().min(1).max(255).optional(),
                })
                .refine((value) => !value.value || typeof value.value === "object", {
                  message: "value must be a JSON object when provided.",
                }),
            )
            .max(100)
            .default([]),
          voice_rules: z
            .array(
              z.discriminatedUnion("rule_type", [
                z.object({
                  rule_type: z.literal("tone"),
                  content: z.string().trim().min(1).max(60),
                }),
                z.object({
                  rule_type: z.literal("do"),
                  content: z.string().trim().min(1).max(280),
                }),
                z.object({
                  rule_type: z.literal("dont"),
                  content: z.string().trim().min(1).max(280),
                }),
              ]),
            )
            .max(200)
            .default([]),
          publishing_rules: z
            .array(
              z.object({
                rule_type: z.enum(BRAND_PUBLISHING_RULE_TYPES),
                title: z.string().trim().min(1).max(80),
                content: z.string().trim().min(1).max(1000),
              }),
            )
            .max(200)
            .default([]),
          linked_resources: z
            .array(
              z.object({
                provider: z.enum(BRAND_LINKED_RESOURCE_PROVIDERS),
                name: z.string().trim().min(1).max(120),
                url: z
                  .string()
                  .url()
                  .refine((value) => value.startsWith("https://"), "Use HTTPS"),
                description: z.string().trim().max(280).optional(),
              }),
            )
            .max(200)
            .default([]),
          response_format: responseFormat,
        })
        .refine((value) => value.conflict_strategy !== "overwrite" || value.confirm === true, {
          message: "conflict_strategy='overwrite' requires confirm=true.",
          path: ["confirm"],
        }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        await requireWorkspace(context, input.workspace_id);

        const strategy: BrandKitConflictStrategy = input.conflict_strategy;
        const existing = await loadBrandKitNameSet(input.workspace_id);

        const summary = {
          created: {
            logos: 0,
            colors: 0,
            fonts: 0,
            other_assets: 0,
            voice_rules: 0,
            publishing_rules: 0,
            linked_resources: 0,
          },
          skipped: {
            logos: [] as string[],
            colors: [] as string[],
            fonts: [] as string[],
            other_assets: [] as string[],
            voice_rules: [] as string[],
            publishing_rules: [] as string[],
            linked_resources: [] as string[],
          },
          failed: [] as { kind: string; name: string; message: string }[],
        };

        const archiveByName = async (
          kind: "logo" | "color" | "font",
          name: string,
        ): Promise<void> => {
          if (strategy !== "overwrite") return;
          const assets = await listBrandAssets(input.workspace_id, { includeArchived: false });
          for (const asset of assets) {
            if (asset.kind === kind && asset.name === name) {
              await db
                .update(brandAssets)
                .set({ archivedAt: new Date(), updatedAt: new Date() })
                .where(
                  and(
                    eq(brandAssets.id, asset.id),
                    eq(brandAssets.workspaceId, input.workspace_id),
                  ),
                );
            }
          }
        };

        for (const logo of input.logos) {
          if (strategy === "merge" && existing.logos.has(logo.name)) {
            summary.skipped.logos.push(logo.name);
            continue;
          }
          if (strategy === "fail" && existing.logos.has(logo.name)) {
            throw new McpToolError(
              "invalid_request",
              `Logo "${logo.name}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            await archiveByName("logo", logo.name);
            await importLogo(context.actor, input.workspace_id, {
              name: logo.name,
              ...(logo.external_url ? { externalUrl: logo.external_url } : {}),
              ...(logo.source_url ? { sourceUrl: logo.source_url } : {}),
              ...(logo.base64 ? { base64: logo.base64 } : {}),
              ext: logo.ext,
            });
            summary.created.logos += 1;
          } catch (error) {
            summary.failed.push({
              kind: "logo",
              name: logo.name,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        for (const color of input.colors) {
          if (strategy === "merge" && existing.colors.has(color.name)) {
            summary.skipped.colors.push(color.name);
            continue;
          }
          if (strategy === "fail" && existing.colors.has(color.name)) {
            throw new McpToolError(
              "invalid_request",
              `Color "${color.name}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            await archiveByName("color", color.name);
            await createColorAsset(context.actor, input.workspace_id, {
              name: color.name,
              hex: color.hex,
              ...(color.color_role ? { colorRole: color.color_role } : {}),
            });
            summary.created.colors += 1;
          } catch (error) {
            summary.failed.push({
              kind: "color",
              name: color.name,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        for (const font of input.fonts) {
          if (strategy === "merge" && existing.fonts.has(font.name)) {
            summary.skipped.fonts.push(font.name);
            continue;
          }
          if (strategy === "fail" && existing.fonts.has(font.name)) {
            throw new McpToolError(
              "invalid_request",
              `Font "${font.name}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            await archiveByName("font", font.name);
            await createFontAsset(context.actor, input.workspace_id, font);
            summary.created.fonts += 1;
          } catch (error) {
            summary.failed.push({
              kind: "font",
              name: font.name,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        for (const asset of input.other_assets) {
          const key = `${asset.kind}:${asset.name}`;
          if (strategy === "merge" && existing.otherAssets.has(key)) {
            summary.skipped.other_assets.push(key);
            continue;
          }
          if (strategy === "fail" && existing.otherAssets.has(key)) {
            throw new McpToolError(
              "invalid_request",
              `Other asset "${key}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            if (strategy === "overwrite") {
              const allAssets = await listBrandAssets(input.workspace_id, {
                includeArchived: false,
              });
              for (const existing of allAssets) {
                if (
                  existing.kind === asset.kind &&
                  existing.name === asset.name &&
                  !["logo", "color", "font"].includes(existing.kind)
                ) {
                  await db
                    .update(brandAssets)
                    .set({ archivedAt: new Date(), updatedAt: new Date() })
                    .where(
                      and(
                        eq(brandAssets.id, existing.id),
                        eq(brandAssets.workspaceId, input.workspace_id),
                      ),
                    );
                }
              }
            }
            await createBrandAsset(context.actor, input.workspace_id, {
              kind: asset.kind,
              name: asset.name,
              ...(asset.value ? { value: asset.value } : {}),
              ...(asset.external_url ? { externalUrl: asset.external_url } : {}),
              ...(asset.storage_path ? { storagePath: asset.storage_path } : {}),
            });
            summary.created.other_assets += 1;
          } catch (error) {
            summary.failed.push({
              kind: "other_asset",
              name: key,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        for (const rule of input.voice_rules) {
          const key = `${rule.rule_type}:${rule.content}`;
          if (strategy === "merge" && existing.voiceRules.has(key)) {
            summary.skipped.voice_rules.push(key);
            continue;
          }
          if (strategy === "fail" && existing.voiceRules.has(key)) {
            throw new McpToolError(
              "invalid_request",
              `Voice rule "${key}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            const command: BrandVoiceRuleCommand = {
              ruleType: rule.rule_type,
              content: rule.content,
            };
            await createBrandVoiceRule(context.actor, input.workspace_id, command);
            summary.created.voice_rules += 1;
          } catch (error) {
            summary.failed.push({
              kind: "voice_rule",
              name: key,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        for (const rule of input.publishing_rules) {
          const key = `${rule.rule_type}:${rule.title}`;
          if (strategy === "merge" && existing.publishingRules.has(key)) {
            summary.skipped.publishing_rules.push(key);
            continue;
          }
          if (strategy === "fail" && existing.publishingRules.has(key)) {
            throw new McpToolError(
              "invalid_request",
              `Publishing rule "${key}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            const command: BrandPublishingRuleCommand = {
              ruleType: rule.rule_type,
              title: rule.title,
              content: rule.content,
            };
            await createBrandPublishingRule(context.actor, input.workspace_id, command);
            summary.created.publishing_rules += 1;
          } catch (error) {
            summary.failed.push({
              kind: "publishing_rule",
              name: key,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        for (const resource of input.linked_resources) {
          if (strategy === "merge" && existing.linkedResources.has(resource.url)) {
            summary.skipped.linked_resources.push(resource.url);
            continue;
          }
          if (strategy === "fail" && existing.linkedResources.has(resource.url)) {
            throw new McpToolError(
              "invalid_request",
              `Linked resource "${resource.url}" already exists; rerun with conflict_strategy='merge' or 'overwrite'.`,
            );
          }
          try {
            const command: BrandLinkedResourceCommand = {
              provider: resource.provider,
              name: resource.name,
              url: resource.url,
              ...(resource.description ? { description: resource.description } : {}),
            };
            await createBrandLinkedResource(context.actor, input.workspace_id, command);
            summary.created.linked_resources += 1;
          } catch (error) {
            summary.failed.push({
              kind: "linked_resource",
              name: resource.url,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
        }

        return result(summary, input.response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
