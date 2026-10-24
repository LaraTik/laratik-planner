import type { Actor } from "@/lib/auth/policy";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import type { z } from "zod";

export type McpContext = { actor: Actor; scopes: McpTokenScope[] };
export type McpResponseFormat = "json" | "markdown";
export type McpResponseFormatSchema = z.ZodType<McpResponseFormat, McpResponseFormat | undefined>;

export type McpToolReply = {
  content: { type: "text"; text: string }[];
  structuredContent?: { result: unknown };
  isError?: boolean;
};

export type McpToolErrorConstructor = new (
  code: "not_found" | "forbidden" | "invalid_request" | "scope_required",
  message: string,
) => Error;

export type McpToolResultHelpers = {
  responseFormat: McpResponseFormatSchema;
  result: (value: unknown, format: McpResponseFormat) => McpToolReply;
  errorResult: (error: unknown) => McpToolReply;
  McpToolError: McpToolErrorConstructor;
};
