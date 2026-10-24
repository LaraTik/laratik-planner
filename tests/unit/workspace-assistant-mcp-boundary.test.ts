import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mcpDocs = readFileSync(resolve(process.cwd(), "docs/api/mcp.md"), "utf8");
const mcpEvaluation = readFileSync(resolve(process.cwd(), "docs/api/mcp-evaluation.xml"), "utf8");
const assistantApiDocs = readFileSync(resolve(process.cwd(), "docs/api/README.md"), "utf8");

describe("Workspace Assistant remote MCP boundary", () => {
  it("documents the assistant as application-only, separate from Planner MCP", () => {
    expect(mcpDocs).toContain("not remote MCP tools");
    expect(assistantApiDocs).toContain("separate from the stateless remote Planner MCP endpoint");
    expect(mcpEvaluation).toContain('id="43"');
    expect(mcpEvaluation).toContain("no assistant-specific tool");
  });
});
