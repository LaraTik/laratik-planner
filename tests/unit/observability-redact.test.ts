import { describe, expect, it } from "vitest";
import { scrubText, serializeError } from "@/lib/observability/redact";

/**
 * The scrubber is the highest-risk module in the change: a false negative
 * writes a credential into Postgres, and a false positive destroys the
 * diagnostic value the in-app mirror exists to provide. Both directions
 * are asserted below with explicit tables.
 */

/** A credential shape that must never survive scrubbing. */
const SECRET_FIXTURES: Array<{ label: string; input: string; forbidden: string }> = [
  // Rule 1 — bearer
  {
    label: "bearer header",
    input: "Authorization: Bearer abc123DEF456ghi",
    forbidden: "abc123DEF456ghi",
  },
  {
    label: "lowercase bearer",
    input: "connect failed, bearer aaaabbbbccccdddd",
    forbidden: "aaaabbbbccccdddd",
  },
  // Rule 2 — JWT
  {
    label: "jwt",
    input:
      "token rejected: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    forbidden: "dozjgNryP4J3jVmNHl0w5N",
  },
  // Rule 3 — MCP token
  {
    label: "mcp token",
    input: "using lpm_abcdefghij0123456789ABCDEFGHIJKLMNOPQRSTUV now",
    forbidden: "lpm_abcdefghij0123456789ABCDEFGHIJKLMNOPQRSTUV",
  },
  // Rule 4 — provider keys
  {
    label: "openai-style key",
    input: "invalid key sk-abcdefghij0123456789ABCDEF",
    forbidden: "sk-abcdefghij0123456789ABCDEF",
  },
  {
    label: "anthropic key",
    input: "upstream rejected sk-ant-api03-abcdefghijklmnop",
    forbidden: "sk-ant-api03-abcdefghijklmnop",
  },
  {
    label: "github token",
    input: "gh token ghp_abcdefghijklmnopqrstuvwxyz0123",
    forbidden: "ghp_abcdefghijklmnopqrstuvwxyz0123",
  },
  {
    label: "gitlab token",
    input: "glpat glpat-abcdefghijklmnopqrst",
    forbidden: "glpat-abcdefghijklmnopqrst",
  },
  {
    label: "slack token",
    input: "slack xoxb-123456789012-abcdefghijkl",
    forbidden: "xoxb-123456789012-abcdefghijkl",
  },
  {
    label: "aws key id",
    input: "aws AKIAIOSFODNN7EXAMPLE denied",
    forbidden: "AKIAIOSFODNN7EXAMPLE",
  },
  // Rule 5 — key/value pairs
  { label: "password pair", input: "smtp password=hunter2 rejected", forbidden: "hunter2" },
  { label: "api key pair", input: "api_key: AKIA-not-real-1234", forbidden: "AKIA-not-real-1234" },
  { label: "secret pair", input: "mySecret=abc123", forbidden: "abc123" },
  {
    label: "cookie pair",
    input: "cookie=authjs.session-token=xyz",
    forbidden: "authjs.session-token=xyz",
  },
  { label: "brief pair", input: "brief=confidential roadmap", forbidden: "confidential roadmap" },
  {
    label: "authorization pair",
    input: "authorization: Bearer zzzzyyyyxxxx",
    forbidden: "zzzzyyyyxxxx",
  },
  {
    label: "quoted secret pair",
    input: 'token="quoted-secret-value"',
    forbidden: "quoted-secret-value",
  },
  // Rule 6 — Postgres detail leaks
  {
    label: "postgres key detail",
    input:
      'duplicate key value violates unique constraint "users_email_key"\nDETAIL:  Key (email)=(alice@example.com) already exists.',
    forbidden: "alice@example.com",
  },
  {
    label: "postgres failing row",
    input:
      'new row for relation "users" violates check constraint\nFailing row contains (1, secretvalue, a@b.co)',
    forbidden: "secretvalue",
  },
  // Rule 7 — email
  {
    label: "bare email",
    input: "could not deliver to bob.smith+tag@example.co.uk",
    forbidden: "bob.smith+tag@example.co.uk",
  },
  // Rule 8 — query-string secrets
  {
    label: "query token",
    input: "GET /api/x?token=supersecretvalue123 failed",
    forbidden: "supersecretvalue123",
  },
  {
    label: "query signature",
    input: "https://cdn.example.com/file?sig=abc123def456&size=10",
    forbidden: "abc123def456",
  },
  // Rule 9 — entropy blob
  {
    label: "opaque blob",
    input:
      "unexpected payload aB3xY9zQ1mN7pR4tW6yU8iO2pA5sD7fG9hJ1kL3zX5cV7bN9mQ2wE4rT6yU8iOpQ2 done",
    forbidden: "aB3xY9zQ1mN7pR4tW6yU8iO2pA5sD7fG9hJ1kL3zX5cV7bN9mQ2wE4rT6yU8iOpQ2",
  },
];

/** Ordinary diagnostic text that must survive byte-identical. */
const SAFE_FIXTURES: string[] = [
  "Workspace not found",
  'Failed query: select 1 from "users" where id = $1',
  'duplicate key value violates unique constraint "users_email_key"',
  "insert into content_item (title, status) values ($1, $2)",
  'record new has no field "updated_at"',
  "    at listAppErrors (/app/src/lib/observability/app-errors.ts:201:22)",
  "    at async POST (/app/.next/server/app/api/tasks/route.js:88:15)",
  "فشل الاتصال بالخادم، حاول مرة أخرى",
  "The user is not a member of this agency",
  "rate limit exceeded, retry after 30",
  "digest=abc123def456 not found",
  'column "session_count" does not exist',
  "Network request failed: ECONNREFUSED 10.0.0.5:5432",
  "hydration failed because the server rendered HTML didn't match the client",
  "Failed to load resource: the server responded with a status of 500",
];

describe("scrubText — secret removal", () => {
  it.each(SECRET_FIXTURES)("removes $label", ({ input, forbidden }) => {
    expect(scrubText(input)).not.toContain(forbidden);
  });

  it("keeps the diagnostic part of a postgres message while dropping the value", () => {
    const out = scrubText(
      'duplicate key value violates unique constraint "users_email_key"\nDETAIL:  Key (email)=(alice@example.com) already exists.',
    );
    expect(out).toContain("users_email_key");
    expect(out).toContain("Key (email)=[redacted]");
    expect(out).not.toContain("alice@example.com");
  });

  it("keeps the diagnostic key name of a query-string secret", () => {
    const out = scrubText("GET /api/x?token=supersecretvalue123&page=2 failed");
    expect(out).toContain("token=[redacted]");
    expect(out).toContain("page=2");
  });
});

describe("scrubText — no over-redaction", () => {
  it.each(SAFE_FIXTURES)("passes through unchanged: %s", (input) => {
    expect(scrubText(input)).toBe(input);
  });

  it("does not treat a long file path as a blob", () => {
    const frame =
      "    at async render (/app/.next/server/chunks/very-long-chunk-filename-8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c.js:412:19)";
    expect(scrubText(frame)).toBe(frame);
  });

  it("keeps the line numbers of a stack frame whose path segment looks sensitive", () => {
    // Regression guard: a `key: value` rule that allowed `.` in the key
    // matched the `session` path segment and redacted the `:1:1`, which
    // is one of the most common frames in this codebase (drizzle-orm's
    // session module). Losing the line number costs real diagnostic value
    // for no security benefit — there is no secret after the colon.
    const frame =
      "DrizzleQueryError: Failed query\n    at /app/node_modules/drizzle-orm/pg-core/session.js:1:1";
    expect(scrubText(frame)).toBe(frame);
    expect(scrubText("at /app/src/lib/auth/session-store.ts:88:20")).toContain(":88:20");
    // The real thing is still redacted.
    expect(scrubText("session=abc123def")).not.toContain("abc123def");
  });

  it("does not treat a SQL statement as a blob", () => {
    const sql =
      'insert into "content_item" ("id","workspace_id","title","format_payload","created_at") values ($1,$2,$3,$4,now())';
    expect(scrubText(sql)).toBe(sql);
  });
});

describe("scrubText — bounds", () => {
  it("truncates to the limit and marks the cut", () => {
    const marker = "…(truncated)";
    const out = scrubText("x".repeat(5_000), 100);
    expect(out.startsWith("x".repeat(100))).toBe(true);
    expect(out.endsWith(marker)).toBe(true);
    expect(out.length).toBe(100 + marker.length);
  });

  it("is idempotent", () => {
    for (const { input } of SECRET_FIXTURES) {
      const once = scrubText(input);
      expect(scrubText(once)).toBe(once);
    }
  });

  it("returns an empty string for a non-positive limit", () => {
    expect(scrubText("anything", 0)).toBe("");
  });
});

describe("serializeError", () => {
  it("keeps name, message, and stack for an ordinary error", () => {
    const err = new TypeError("cannot read properties of undefined (reading 'id')");
    const out = serializeError(err);
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("cannot read properties of undefined (reading 'id')");
    expect(out.stack).toContain("TypeError");
  });

  it("scrubs a secret out of the message while keeping name and stack", () => {
    const err = new Error("connect failed for Bearer sk-abcdefghij0123456789ABCDEF");
    err.stack = "Error: connect failed\n    at fetch (/app/src/lib/ai.ts:12:3)";
    const out = serializeError(err);
    expect(out.name).toBe("Error");
    expect(out.message).not.toContain("sk-abcdefghij0123456789ABCDEF");
    expect(out.stack).toContain("at fetch (/app/src/lib/ai.ts:12:3)");
  });

  it("surfaces one level of cause (the Drizzle → Postgres reason)", () => {
    const err = new Error('Failed query: insert into "users" ... ');
    (err as { cause?: unknown }).cause = new Error(
      'duplicate key value violates unique constraint "users_email_key"\nDETAIL:  Key (email)=(a@b.co) already exists.',
    );
    const out = serializeError(err);
    expect(out.message).toContain("Failed query");
    expect(out.cause?.message).toContain("users_email_key");
    expect(out.cause?.message).toContain("Key (email)=[redacted]");
    expect(out.cause?.message).not.toContain("a@b.co");
  });

  it("surfaces a plain-object cause, which is what the client boundary ships", () => {
    const err = new Error("wrapper");
    (err as { cause?: unknown }).cause = {
      name: "Cause",
      message: 'duplicate key value violates unique constraint "users_email_key"',
    };
    const out = serializeError(err);
    expect(out.cause?.name).toBe("Cause");
    expect(out.cause?.message).toContain("users_email_key");
  });

  it("reads message/name/stack off the plain object recordErrorBoundaryAction sends", () => {
    // This is the exact shape `src/app/(app)/error-actions.ts` builds,
    // because a client component cannot hand a real `Error` across the
    // server-action boundary. Before the structural read was added, every
    // row written by the boundary stored message "Unknown error".
    const out = serializeError({
      name: "ZodError",
      message: "Invalid input: expected string, received number",
      stack: "ZodError: Invalid input\n    at parse (/app/src/lib/schemas.ts:88:20)",
      cause: { name: "Cause", message: 'column "updated_at" does not exist' },
    });
    expect(out.name).toBe("ZodError");
    expect(out.message).toBe("Invalid input: expected string, received number");
    expect(out.stack).toContain("at parse (/app/src/lib/schemas.ts:88:20)");
    expect(out.cause?.message).toBe('column "updated_at" does not exist');
  });

  it("handles a string cause", () => {
    const err = new Error("wrapper");
    (err as { cause?: unknown }).cause = "raw reason";
    expect(serializeError(err).cause?.message).toBe("raw reason");
  });

  it("omits cause when there is none", () => {
    expect(serializeError(new Error("plain")).cause).toBeUndefined();
  });

  it("collapses a non-Error throw to Unknown error", () => {
    expect(serializeError({ weird: true }).message).toBe("Unknown error");
  });

  it("keeps a string throw readable", () => {
    const out = serializeError("something went sideways");
    expect(out.message).toBe("something went sideways");
  });

  it("falls back to the name when the message is empty", () => {
    const err = new Error("");
    err.name = "WeirdError";
    expect(serializeError(err).message).toBe("WeirdError");
  });

  it("truncates the stack to the requested budget", () => {
    const err = new Error("deep");
    err.stack = `Error: deep\n${"    at f (/app/x.ts:1:1)\n".repeat(500)}`;
    const out = serializeError(err, { stackBytes: 200 });
    expect(out.stack?.endsWith("…(truncated)")).toBe(true);
    expect(out.stack!.length).toBeLessThan(300);
  });

  it("reads name/stack from an error-like plain object", () => {
    const out = serializeError({ name: "WeirdError", message: "boom", stack: "WeirdError: boom" });
    expect(out.name).toBe("WeirdError");
    expect(out.message).toBe("boom");
    expect(out.stack).toBe("WeirdError: boom");
  });
});
