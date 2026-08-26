import { describe, expect, it } from "vitest";
import { formatErrorReport, matchErrorHint } from "@/lib/observability/error-hints";

/**
 * Regression guard for the 2026-08-27 error-boundary redesign.
 *
 * The new boundary renders a "Root cause" hint that maps the
 * captured error fields to one of ~8 known patterns and shows 2–3
 * concrete fix steps. If the matcher ever drops a known pattern,
 * the UI falls back to the generic "unknown" card and the user
 * loses the actionable narrative. The 8 tests below pin one case
 * per known pattern + the fallback + the markdown report shape.
 */

describe("matchErrorHint", () => {
  it("React #441 → hooks count", () => {
    const h = matchErrorHint({
      message: "Minified React error #441; visit https://react.dev/errors/441",
    });
    expect(h.id).toBe("react-hooks-count");
    expect(h.title.toLowerCase()).toContain("hooks");
  });

  it("Postgres 'has no field' → trigger references missing column", () => {
    const h = matchErrorHint({
      message: "Failed query: …",
      causeMessage: 'record "new" has no field "updated_at"',
    });
    expect(h.id).toBe("pg-missing-column-or-trigger");
  });

  it("'Failed query' wrapper → server action threw", () => {
    const h = matchErrorHint({
      message: "Failed query: insert into …",
      causeMessage: "duplicate key value violates unique constraint",
    });
    expect(h.id).toBe("server-action-threw");
  });

  it("RSC function-prop rejection → RSC function across boundary", () => {
    const h = matchErrorHint({
      message:
        'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server".',
    });
    expect(h.id).toBe("rsc-function-prop");
  });

  it("FK violation → foreign key blocked the write", () => {
    const h = matchErrorHint({
      message: "Failed query: …",
      causeMessage:
        'insert or update on table "workspace_membership" violates foreign key constraint "workspace_membership_workspace_id_workspace_id_fk"',
    });
    expect(h.id).toBe("pg-foreign-key");
  });

  it("Zod error name → Zod validation", () => {
    const h = matchErrorHint({
      errorName: "ZodError",
      message: "[ { … invalid_type: expected string, received number … } ]",
    });
    expect(h.id).toBe("zod-validation");
  });

  it("Hydration mismatch → server HTML didn't match client", () => {
    const h = matchErrorHint({
      message:
        "Hydration failed because the initial UI does not match what was rendered on the server.",
    });
    expect(h.id).toBe("hydration-mismatch");
  });

  it("501 / not implemented → capability intentionally off", () => {
    const h = matchErrorHint({
      message: "This capability is not implemented in the current build.",
    });
    expect(h.id).toBe("not-implemented");
  });

  it("Unknown pattern → generic 'captured, no specific match' fallback", () => {
    const h = matchErrorHint({
      message: "Some completely novel error we have not seen before.",
    });
    expect(h.id).toBe("unknown");
    // The fallback still ships actionable fixes so the UI is never
    // empty / useless.
    expect(h.fixes.length).toBeGreaterThan(0);
  });
});

describe("formatErrorReport", () => {
  it("emits a markdown report with every captured field", () => {
    const hint = matchErrorHint({ message: "Minified React error #441" });
    const md = formatErrorReport({
      reference: "abc123",
      route: "/app/users",
      method: "GET",
      message: "Minified React error #441; visit https://react.dev/errors/441",
      errorName: "Error",
      digest: "441",
      buildVersion: "deadbeef",
      occurredAt: "2026-08-27T00:00:00.000Z",
      hint,
    });
    expect(md).toContain("# React: more hooks than during the previous render");
    expect(md).toContain("`abc123`");
    expect(md).toContain("`/app/users`");
    expect(md).toContain("`deadbeef`");
    expect(md).toContain("## Why this is happening");
    expect(md).toContain("## Fixes");
  });

  it("includes the cause block when causeMessage is present", () => {
    const hint = matchErrorHint({
      message: "Failed query: …",
      causeMessage: 'record "new" has no field "updated_at"',
    });
    const md = formatErrorReport({
      reference: "ref",
      route: "/app/users",
      message: "Failed query: …",
      causeMessage: 'record "new" has no field "updated_at"',
      occurredAt: "now",
      hint,
    });
    expect(md).toContain("## Cause");
    expect(md).toContain('record "new" has no field "updated_at"');
  });
});
