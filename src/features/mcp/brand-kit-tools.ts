import "server-only";

import { and, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { brandAssets } from "@/lib/db/schema";
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
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";
import { PermissionDeniedError } from "@/lib/auth/policy";
import { logError } from "@/lib/observability/logger";

type BrandKitDependencies = McpToolResultHelpers & {
  workspaceId: z.ZodString;
  requireWorkspace: (context: McpContext, id: string) => Promise<unknown>;
  requireScope: (context: McpContext, scope: McpTokenScope) => void;
};

export function registerBrandKitTools(
  server: McpServer,
  context: McpContext,
  dependencies: BrandKitDependencies,
) {
  const {
    workspaceId,
    responseFormat,
    requireWorkspace,
    requireScope,
    result,
    errorResult,
    McpToolError,
  } = dependencies;

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

  function importFailureMessage(error: unknown, fallback: string): string {
    if (error instanceof McpToolError) return error.message;
    if (error instanceof PermissionDeniedError) {
      return "You do not have permission to import this item.";
    }
    logError("mcp.brand_kit.import_item_failed", { err: error });
    return fallback;
  }

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
      logError("mcp.brand_kit.logo_source_fetch_failed", { err: error });
      throw new McpToolError("invalid_request", "Logo source fetch failed.");
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
    actor: McpContext["actor"],
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
              message: importFailureMessage(error, "Logo import failed."),
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
              message: importFailureMessage(error, "Color import failed."),
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
              message: importFailureMessage(error, "Font import failed."),
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
              message: importFailureMessage(error, "Asset import failed."),
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
              message: importFailureMessage(error, "Voice rule import failed."),
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
              message: importFailureMessage(error, "Publishing rule import failed."),
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
              message: importFailureMessage(error, "Linked resource import failed."),
            });
          }
        }

        return result(summary, input.response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
