import "server-only";

import { desc, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { appErrorEvents, appErrorGroups } from "@/lib/db/schema";
import {
  getAppErrorById,
  getAppErrorDiagnostics,
  getAppErrorHealth,
  listAppErrorGroups,
  listAppErrors,
  triageAppErrorGroup,
  type AppErrorDetail,
} from "@/lib/observability/app-errors";
import { matchErrorHint } from "@/lib/observability/error-hints";
import { z } from "zod";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";

type DiagnosticToolsDependencies = McpToolResultHelpers & {
  requireDiagnosticsAccess: (
    context: McpContext,
    scope: "platform:diagnostics:read" | "platform:diagnostics:write",
  ) => Promise<void>;
};

/** Resolve a group fingerprint to its row id, or `null` when unknown. */
async function groupIdFor(fingerprint: string): Promise<string | null> {
  const [row] = await db
    .select({ id: appErrorGroups.id })
    .from(appErrorGroups)
    .where(eq(appErrorGroups.fingerprint, fingerprint))
    .limit(1);
  return row?.id ?? null;
}

export function registerDiagnosticTools(
  server: McpServer,
  context: McpContext,
  dependencies: DiagnosticToolsDependencies,
) {
  const { responseFormat, requireDiagnosticsAccess, result, errorResult, McpToolError } =
    dependencies;

  // ─── Error diagnostics (OBS-002) ────────────────────────────────────────
  //
  // These five tools exist so an operator (or an agent) can go from
  // "the server errored" to a ranked root-cause hypothesis without
  // leaving the API. They read the in-app mirror, not VPS container
  // stdout: the endpoint is public HTTP and has no host access, which
  // is also why the mirror records the request's own log lines under
  // `context.logs` (see `observability/request-context.ts`).
  //
  // Every one of them is gated on the `platform.console.read` platform
  // permission in addition to a diagnostics token scope. See
  // `requireDiagnosticsAccess` for why the scope alone is not enough.

  const isoSince = z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "ISO-8601 timestamp lower bound, e.g. 2026-09-27T00:00:00Z. Defaults to 24 hours ago. Clamped to a 30-day window.",
    );

  /** Resolve + clamp the `since` window. Throws on a malformed value. */
  function resolveSince(since: string | undefined): Date {
    if (!since) return new Date(Date.now() - 24 * 60 * 60 * 1000);
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      throw new McpToolError("invalid_request", `since is not a valid ISO-8601 date: ${since}`);
    }
    const floor = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return parsed.getTime() < floor ? new Date(floor) : parsed;
  }

  const fingerprintArg = z
    .string()
    .trim()
    .regex(/^[0-9a-f]{12}$/, "fingerprint must be 12 lowercase hex characters")
    .describe("Error-group fingerprint returned by list_app_errors or app_health.");

  server.registerTool(
    "laratik_planner_list_app_errors",
    {
      title: "List recent application errors",
      description:
        "List captured application errors from the in-app mirror, grouped by error class. Returns one row per distinct failure with its occurrence count and first/last-seen timestamps, newest first. This is the entry point for triage: take a `fingerprint` from the result and pass it to diagnose_app_error for a root-cause hypothesis. Requires the platform:diagnostics:read scope AND the platform.console.read permission.",
      inputSchema: z.object({
        since: isoSince,
        route: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("Route prefix filter, e.g. /api/ai or /app/w."),
        source: z
          .enum([
            "app.error",
            "global.error",
            "server_action",
            "client.unhandled",
            "server.render",
            "server.route",
            "server.proxy",
            "server.unhandled",
          ])
          .optional()
          .describe(
            "Exact origin filter. server.* and server_action come from the Next.js onRequestError hook (renders, route handlers, server actions, proxy); app.error / global.error come from the React boundaries.",
          ),
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("Case-insensitive substring match against the scrubbed message or the route."),
        resolved: z
          .boolean()
          .optional()
          .describe("true = only triaged groups, false = only untriaged, omitted = both."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Maximum groups to return (1-100, default 25)."),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ since, route, source, query, resolved, limit, response_format }) => {
      try {
        await requireDiagnosticsAccess(context, "platform:diagnostics:read");
        const sinceDate = resolveSince(since);

        // A `query` has no group-level column to match against, so route
        // it through the event table to discover fingerprints, then read
        // the groups. Without a query this is a single grouped read.
        let groupIds: string[] | null = null;
        if (query) {
          const matches = await listAppErrors({
            page: 1,
            pageSize: 200,
            query,
            ...(source ? { source } : {}),
            ...(route ? { routePrefix: route } : {}),
            since: sinceDate,
            ...(typeof resolved === "boolean" ? { resolved } : {}),
          });
          groupIds = Array.from(
            new Set(matches.rows.map((row) => row.groupId).filter((id): id is string => !!id)),
          );
          if (groupIds.length === 0) return result({ groups: [], count: 0 }, response_format);
        }

        const groups = await listAppErrorGroups({
          since: sinceDate,
          ...(typeof resolved === "boolean" ? { resolved } : {}),
          ...(source ? { source } : {}),
          ...(route ? { routePrefix: route } : {}),
          ...(groupIds ? { groupIds } : {}),
          limit,
        });

        return result(
          {
            count: groups.length,
            since: sinceDate.toISOString(),
            groups: groups.map((group) => ({
              fingerprint: group.fingerprint,
              occurrenceCount: group.occurrenceCount,
              errorName: group.errorName,
              sampleMessage: group.sampleMessage,
              route: group.route,
              source: group.source,
              firstSeenAt: group.firstSeenAt,
              lastSeenAt: group.lastSeenAt,
              resolvedAt: group.resolvedAt,
            })),
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_get_app_error",
    {
      title: "Get one application error in full",
      description:
        "Fetch a single error occurrence with its full diagnostic payload: scrubbed message, chained cause, truncated stack, the request's recent log lines, and its group's occurrence count and triage state. Identify the occurrence by exactly one of `id`, `fingerprint` (returns the most recent occurrence in that group), or `request_id` (joins to the log lines of one HTTP request). Requires the platform:diagnostics:read scope AND the platform.console.read permission.",
      inputSchema: z
        .object({
          id: z.string().guid().optional().describe("Exact error-occurrence UUID."),
          fingerprint: fingerprintArg.optional(),
          request_id: z
            .string()
            .trim()
            .min(1)
            .max(128)
            .optional()
            .describe("Correlation id from the x-request-id response header."),
          response_format: responseFormat,
        })
        .refine((v) => [v.id, v.fingerprint, v.request_id].filter(Boolean).length === 1, {
          message: "Provide exactly one of id, fingerprint, or request_id.",
        }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, fingerprint, request_id, response_format }) => {
      try {
        await requireDiagnosticsAccess(context, "platform:diagnostics:read");

        /** Most recent occurrence matching a predicate, or null. */
        const latestFor = async (
          column: typeof appErrorEvents.groupId | typeof appErrorEvents.requestId,
          value: string,
        ): Promise<AppErrorDetail | null> => {
          const [hit] = await db
            .select({ id: appErrorEvents.id })
            .from(appErrorEvents)
            .where(eq(column, value))
            .orderBy(desc(appErrorEvents.createdAt))
            .limit(1);
          return hit ? getAppErrorById(hit.id) : null;
        };

        let row: AppErrorDetail | null = null;
        if (id) {
          row = await getAppErrorById(id);
        } else if (fingerprint) {
          const groupId = await groupIdFor(fingerprint);
          if (groupId) row = await latestFor(appErrorEvents.groupId, groupId);
        } else if (request_id) {
          row = await latestFor(appErrorEvents.requestId, request_id);
        }

        if (!row) {
          throw new McpToolError("not_found", "No matching application error was found.");
        }
        const group = row.groupId
          ? await db
              .select({
                fingerprint: appErrorGroups.fingerprint,
                occurrenceCount: appErrorGroups.occurrenceCount,
                firstSeenAt: appErrorGroups.firstSeenAt,
                lastSeenAt: appErrorGroups.lastSeenAt,
                resolvedAt: appErrorGroups.resolvedAt,
                triageNote: appErrorGroups.triageNote,
              })
              .from(appErrorGroups)
              .where(eq(appErrorGroups.id, row.groupId))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : null;

        return result(
          {
            ...row,
            createdAt: row.createdAt,
            group,
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_diagnose_app_error",
    {
      title: "Diagnose an application error and suggest a root cause",
      description:
        "The one-call triage tool: given a fingerprint (or a free-text query), return a ranked root-cause hypothesis with concrete fix steps, the occurrence count and first/last-seen window, an hourly histogram, the distinct build versions the error has appeared on (which is how you spot a regression introduced by a specific deploy), the routes and sources it has hit, and the most recent occurrences. Start here when a user reports that something is broken. Requires the platform:diagnostics:read scope AND the platform.console.read permission.",
      inputSchema: z
        .object({
          fingerprint: fingerprintArg.optional(),
          query: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .optional()
            .describe("Free-text search used when no fingerprint is known. Matches the top group."),
          since: isoSince,
          response_format: responseFormat,
        })
        .refine((v) => !!(v.fingerprint || v.query), {
          message: "Provide either fingerprint or query.",
        }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ fingerprint, query, since, response_format }) => {
      try {
        await requireDiagnosticsAccess(context, "platform:diagnostics:read");
        const sinceDate = resolveSince(since);

        let target = fingerprint;
        if (!target && query) {
          const groups = await listAppErrorGroups({ since: sinceDate, limit: 1, query });
          if (!groups[0]) {
            return result(
              { found: false, query, message: "No error group matched that query." },
              response_format,
            );
          }
          target = groups[0].fingerprint;
        }
        if (!target) {
          throw new McpToolError("invalid_request", "Provide either fingerprint or query.");
        }

        const diagnostics = await getAppErrorDiagnostics(target, { since: sinceDate });
        if (!diagnostics) {
          return result(
            { found: false, fingerprint: target, message: "No error group with that fingerprint." },
            response_format,
          );
        }

        // Reuse the boundary's pattern matcher rather than inventing a
        // second root-cause taxonomy. The most recent sample carries the
        // most specific cause chain, so it is the best hint input.
        const sample = diagnostics.recent[0];
        const hint = sample
          ? matchErrorHint({
              errorName: sample.errorName ?? undefined,
              message: sample.message,
              ...(sample.causeMessage ? { causeMessage: sample.causeMessage } : {}),
              ...(sample.digest ? { digest: sample.digest } : {}),
              ...(sample.componentStack ? { componentStack: sample.componentStack } : {}),
            })
          : null;

        return result(
          {
            found: true,
            fingerprint: diagnostics.group.fingerprint,
            rootCause: hint
              ? { id: hint.id, title: hint.title, why: hint.why, fixes: hint.fixes }
              : null,
            occurrences: diagnostics.group.occurrenceCount,
            firstSeenAt: diagnostics.group.firstSeenAt,
            lastSeenAt: diagnostics.group.lastSeenAt,
            resolvedAt: diagnostics.group.resolvedAt,
            triageNote: diagnostics.group.triageNote,
            errorName: diagnostics.group.errorName,
            sampleMessage: diagnostics.group.sampleMessage,
            route: diagnostics.group.route,
            // A group appearing on exactly one build version is the
            // regression signal: correlate the SHA with the deploy log.
            builds: diagnostics.builds,
            routes: diagnostics.routes,
            sources: diagnostics.sources,
            hourly: diagnostics.hourly,
            cappedOccurrences: diagnostics.cappedOccurrences,
            recentOccurrences: diagnostics.recent.map((row) => ({
              id: row.id,
              message: row.message,
              causeMessage: row.causeMessage,
              route: row.route,
              method: row.method,
              source: row.source,
              routeType: row.routeType,
              buildVersion: row.buildVersion,
              createdAt: row.createdAt,
            })),
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_app_health",
    {
      title: "Check application health and recent error volume",
      description:
        "Report whether the app and its database are reachable, the running build, error counts for the last hour and last 24 hours, how many occurrences had their event row suppressed by the burst cap, and the three most frequent untriaged error groups. Use this first when triaging a report of downtime: it distinguishes 'one user hit an error' from 'the app is broken for everyone'. Requires the platform:diagnostics:read scope AND the platform.console.read permission.",
      inputSchema: z.object({ response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      try {
        await requireDiagnosticsAccess(context, "platform:diagnostics:read");
        return result(await getAppErrorHealth(), response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_triage_app_error",
    {
      title: "Mark an error group triaged or reopen it",
      description:
        "Set or clear the triage state of an error group: `action='resolve'` records that an operator has acknowledged it, `action='reopen'` clears it. Optionally attaches a note (max 500 chars) explaining the fix or why it is acceptable. Idempotent — resolving an already-resolved group succeeds without changing anything. This is the only mutating diagnostics tool, and it changes no product data: it only annotates the error mirror. Requires the platform:diagnostics:write scope AND the platform.console.read permission, and an explicit `confirm: true`.",
      inputSchema: z.object({
        fingerprint: fingerprintArg,
        action: z
          .enum(["resolve", "reopen"])
          .describe("'resolve' marks the group triaged; 'reopen' clears the state."),
        note: z
          .string()
          .trim()
          .max(500)
          .optional()
          .describe("Optional triage note, max 500 characters."),
        confirm: z
          .boolean()
          .describe("Must be true. Present so a mutating call is always an explicit choice."),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ fingerprint, action, note, confirm, response_format }) => {
      try {
        await requireDiagnosticsAccess(context, "platform:diagnostics:write");
        if (confirm !== true) {
          throw new McpToolError(
            "invalid_request",
            "Triage changes the error mirror; pass confirm: true to proceed.",
          );
        }
        const updated = await triageAppErrorGroup({
          fingerprint,
          action,
          ...(note ? { note } : {}),
        });
        if (!updated) {
          throw new McpToolError("not_found", "No error group with that fingerprint.");
        }
        return result(
          {
            fingerprint: updated.fingerprint,
            occurrenceCount: updated.occurrenceCount,
            resolvedAt: updated.resolvedAt,
            triageNote: updated.triageNote,
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
