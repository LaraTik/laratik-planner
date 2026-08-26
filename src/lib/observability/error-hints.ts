/**
 * Error pattern hints — small lookup that turns a common error
 * pattern into a "what this means" + "where to look" + "common
 * fix" message for the error boundary.
 *
 * Why this exists
 * ───────────────
 * Production error boundaries tend to show two things:
 *   1. A short minified error code ("Minified React error #441")
 *   2. A raw, low-context message ("record 'new' has no field
 *      'updated_at'")
 *
 * Both are accurate but neither tells the on-call engineer or the
 * power user what to do next. The user has to know that #441 is a
 * hooks count mismatch, or that the "record 'new' has no field"
 * comes from a Postgres BEFORE-UPDATE trigger that targets a column
 * the table doesn't have. This module is the bridge: it inspects
 * the captured error and returns the actionable narrative.
 *
 * It is server-safe (no DOM, no hooks, no React imports) so it can
 * be unit-tested in plain Node and shared between the error
 * boundary and the platform-errors table renderer.
 *
 * The list is deliberately small — the top 6 patterns cover
 * ≈80% of the Sentry volume on a typical laratik-planner day.
 * Anything that doesn't match falls back to a generic "captured
 * but unknown" hint, so the UI never renders an empty box.
 */

export type ErrorHint = {
  /** Stable id used in the UI and tests. */
  id: string;
  /** Single-sentence "what this is". */
  title: string;
  /** 1–2 sentences explaining why this is happening. */
  why: string;
  /**
   * Ordered list of "do this next" steps. Keep them concrete
   * (specific file path, specific command, specific env var) so
   * the user can act without further investigation.
   */
  fixes: string[];
  /**
   * Optional docs link — the workspace runs `docs/operations/` and
   * `docs/production-readiness/`; the runbook search is the canonical
   * starting point. We don't hard-code paths because the docs tree
   * moves; we point at the runbook index.
   */
  runbookHint?: string;
};

export type ErrorPatternInput = {
  /** The captured `error.name`, if the boundary saw an Error instance. */
  errorName?: string | undefined;
  /** The captured `error.message`. */
  message: string;
  /** Chained `error.cause.message` when present (one level). */
  causeMessage?: string | undefined;
  /** The Next.js digest, when one was assigned. */
  digest?: string | undefined;
  /**
   * React's component stack on client boundaries. We don't match on
   * it for now (it's long and noisy) but the field is forwarded
   * so future patterns can use it.
   */
  componentStack?: string | undefined;
};

const PATTERNS: ReadonlyArray<{
  test: (input: ErrorPatternInput) => boolean;
  hint: ErrorHint;
}> = [
  {
    // React #441 — "Rendered more hooks than during the previous
    // render." Hook count mismatch between renders. Almost always
    // an early return before a hook, or a hook added inside a
    // conditional.
    test: (i) =>
      /Rendered more hooks than during the previous render/.test(i.message) ||
      i.digest === "441" ||
      /#441/.test(i.message),
    hint: {
      id: "react-hooks-count",
      title: "React: more hooks than during the previous render (error #441)",
      why: "A component called a different number of hooks between renders. Hooks must be called in the same order every render — a conditional return, an early exit, or a hook inside a `if (...)` block are the usual suspects.",
      fixes: [
        "Move every `useState` / `useEffect` / `useMemo` / `useCallback` to the top of the component, before any early `return` or conditional.",
        "Search the component (and any new conditional you recently added) for `return` statements that sit between hook calls.",
        "If the component is a Server Component passing a function prop (e.g. `onClick`) to a Client Component, switch the prop to a `useCallback` or to a `use server` action — function values cannot cross the RSC boundary.",
      ],
      runbookHint: "docs/operations/runbook.md#react-441",
    },
  },
  {
    // Postgres trigger / column mismatch — checked BEFORE the
    // generic "server action threw" so the actionable narrative
    // (a trigger references a missing column) wins over the
    // generic "action threw" wording.
    test: (i) =>
      /has no field/.test(i.message) ||
      /has no field/.test(i.causeMessage ?? "") ||
      (/does not exist/.test(i.message) && /column/i.test(i.message)),
    hint: {
      id: "pg-missing-column-or-trigger",
      title: "Postgres: a trigger references a column the table doesn't have",
      why: "A BEFORE-UPDATE trigger calls `NEW.<col> = ...` but the table is missing that column. The trigger fires on every UPDATE and aborts the surrounding transaction, so the whole action fails.",
      fixes: [
        "Check the trigger function for the column name in the error message — it tells you which column is missing.",
        "Add the missing column with an idempotent migration (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`).",
        "If the column is intentional, run the migration; if the trigger is wrong, drop the trigger from that table's list.",
      ],
      runbookHint: "docs/operations/runbook.md#pg-trigger-missing-column",
    },
  },
  {
    // FK violation — also BEFORE the generic action-threw pattern
    // so the constraint-specific guidance wins.
    test: (i) =>
      /violates foreign key constraint/.test(i.message) ||
      /violates foreign key constraint/.test(i.causeMessage ?? ""),
    hint: {
      id: "pg-foreign-key",
      title: "Postgres: a foreign key blocked the write",
      why: "The row you tried to insert / update references a parent row that does not exist (or that was deleted between read and write).",
      fixes: [
        "Check the constraint name in the message — it points at the missing parent table + column.",
        "Verify the seed / parent row was actually committed (look for it in the matching table before the failing insert).",
        "If the test data is fixture-only, this is the test isolation bug — seed the parent in the same test that creates the child.",
      ],
    },
  },
  {
    // RSC — function passed across server→client boundary.
    test: (i) =>
      /Functions cannot be passed directly to Client Components/.test(i.message) ||
      /Only plain objects can be passed to Client Components/.test(i.message),
    hint: {
      id: "rsc-function-prop",
      title: "Server → Client: a function was passed across the RSC boundary",
      why: 'React Server Components cannot serialise function values. A Server Component forwarded a component, an `onClick` handler, a LucideIcon, or another function to a `"use client"` component.',
      fixes: [
        "Pass a serialisable identifier (a string enum) instead of the function; resolve the value inside the client component.",
        "If the value is a LucideIcon, store a stable name in your server-side config and look up the icon in a map on the client side.",
        'If the value is an event handler, mark it with `"use server"` and pass the action reference, not a closure.',
      ],
    },
  },
  {
    // Zod validation failure (the boundary caught it).
    test: (i) =>
      /invalid_type|invalid_string|too_small|too_big|invalid_enum_value/.test(i.message) ||
      /ZodError/.test(i.errorName ?? ""),
    hint: {
      id: "zod-validation",
      title: "Input validation failed (Zod)",
      why: "A server action validated the incoming form data with Zod and one of the fields did not match the expected shape.",
      fixes: [
        "Open the form and inspect the highlighted field — the error message names the path (e.g. `body.title`).",
        "If the form is generated from a server action, the field name in the schema must match the input `name` in the JSX.",
        "If the failure is unexpected, look at the user's most recent edits — they likely entered a value the schema doesn't accept (very long title, wrong type, etc.).",
      ],
    },
  },
  {
    // Hydration mismatch — different but related class.
    test: (i) =>
      /Hydration failed/.test(i.message) ||
      /server rendered HTML didn't match/.test(i.message) ||
      /Text content does not match server-rendered HTML/.test(i.message),
    hint: {
      id: "hydration-mismatch",
      title: "React: server HTML didn't match the client (hydration mismatch)",
      why: "The component renders different markup on the server vs the client. Usual causes: `Date.now()`, `Math.random()`, `window.*`, or a `new Date()` without an explicit timezone.",
      fixes: [
        "Wrap the time-sensitive part in a useEffect + useState, or use `<ClientOnly>` to render it on the client only.",
        "If the difference is a trailing space, normalise the input server-side before rendering.",
        "Run the page in dev — the console prints the exact diff with line numbers.",
      ],
    },
  },
  {
    // Server action threw (generic catch-all for "Failed query"
    // wrappers that didn't match a more specific pattern above).
    // Intentionally last so the FK / trigger / Zod / hydration
    // patterns above win.
    test: (i) => i.causeMessage !== undefined && /Failed query/.test(i.message),
    hint: {
      id: "server-action-threw",
      title: "A server action threw — the error boundary caught it",
      why: "A `use server` action threw. The client received the rejection, React re-threw it to the nearest error boundary, and the boundary replaced the page.",
      fixes: [
        "Open the page in a new tab and repeat the action — if the boundary's stack trace shows the action's source, the thrown line is where to start.",
        "Wrap the action's `db.transaction(...)` block in a `try / catch` that returns `{ error: '...' }` so the form shows an inline message instead of replacing the page.",
        "If the error references a `UNIQUE` / `FK` / `NOT NULL` constraint, fix the data, not the action — the action is doing the right thing.",
      ],
    },
  },
  {
    // Not implemented (501) — used by AI when env kill-switch is off.
    test: (i) => /not implemented/i.test(i.message) || /notImplemented/i.test(i.errorName ?? ""),
    hint: {
      id: "not-implemented",
      title: "This capability is intentionally not wired in the current build",
      why: "The route returns 501 when the matching feature flag is off. This is a build-time gate, not a bug — the UI should normally hide the button before you get here.",
      fixes: [
        "If the button is showing in the UI, hide it via the same feature flag the route checks.",
        "If you need this capability enabled, set the env var or feature flag mentioned in the route's `if (!isEnabled)` branch and redeploy.",
      ],
    },
  },
];

/**
 * Match the captured error against the pattern table. Order matters —
 * the first match wins. Put the most specific tests first; the
 * generic "server-action-threw" is intentionally near the end so it
 * doesn't catch FK / trigger / hooks issues that have a more
 * actionable pattern.
 */
export function matchErrorHint(input: ErrorPatternInput): ErrorHint {
  for (const p of PATTERNS) {
    if (p.test(input)) return p.hint;
  }
  // Generic fallback. The user can still copy the full report and
  // paste it into the runbook search.
  return {
    id: "unknown",
    title: "Captured, but no specific pattern matched",
    why: "We caught the error, sent it to Sentry, and recorded a row in the in-app mirror. The on-call view in `/app/platform/errors` has the same row with the full stack and any chained `cause`.",
    fixes: [
      "Copy the full report (button below) and paste it into the runbook search at docs/operations/runbook.md.",
      "If the error reproduces, the most recent deploy is the prime suspect — check the build SHA above against `git log`.",
      "If the action is the source, wrap it in `try / catch` that returns `{ error }` so the form shows an inline message.",
    ],
  };
}

/**
 * Build a copyable markdown report from the captured error + UI
 * context. Kept here (not in the React component) so the same
 * formatter powers the support mailto body, the clipboard payload,
 * and any future "send to on-call" integration.
 */
export function formatErrorReport(input: {
  reference: string;
  route: string;
  method?: string | undefined;
  message: string;
  errorName?: string | undefined;
  causeMessage?: string | undefined;
  digest?: string | undefined;
  buildVersion?: string | undefined;
  actorId?: string | null | undefined;
  userAgent?: string | undefined;
  viewport?: { width: number; height: number } | undefined;
  locale?: string | undefined;
  occurredAt: string;
  hint: ErrorHint;
  /** Optional truncated stack trace. */
  stack?: string | undefined;
  /** Optional React component stack. */
  componentStack?: string | undefined;
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.hint.title}`);
  lines.push("");
  lines.push(`- **Reference**: \`${input.reference}\``);
  if (input.digest) lines.push(`- **Digest**: \`${input.digest}\``);
  if (input.errorName) lines.push(`- **Error class**: \`${input.errorName}\``);
  lines.push(`- **Route**: \`${input.route}\``);
  if (input.method) lines.push(`- **Method**: \`${input.method}\``);
  lines.push(`- **When**: ${input.occurredAt}`);
  if (input.buildVersion) lines.push(`- **Build**: \`${input.buildVersion}\``);
  if (input.actorId) lines.push(`- **Actor**: \`${input.actorId}\``);
  if (input.userAgent) lines.push(`- **User agent**: \`${input.userAgent}\``);
  if (input.viewport) {
    lines.push(`- **Viewport**: ${input.viewport.width}×${input.viewport.height}`);
  }
  if (input.locale) lines.push(`- **Locale**: ${input.locale}`);
  lines.push("");
  lines.push("## Message");
  lines.push("```");
  lines.push(input.message.slice(0, 2_000));
  lines.push("```");
  if (input.causeMessage) {
    lines.push("");
    lines.push("## Cause");
    lines.push("```");
    lines.push(input.causeMessage.slice(0, 2_000));
    lines.push("```");
  }
  lines.push("");
  lines.push("## Why this is happening");
  lines.push(input.hint.why);
  lines.push("");
  lines.push("## Fixes");
  for (const f of input.hint.fixes) lines.push(`- ${f}`);
  if (input.hint.runbookHint) {
    lines.push("");
    lines.push(`> Search the runbook for \`${input.hint.runbookHint}\`.`);
  }
  if (input.stack) {
    lines.push("");
    lines.push("## Stack trace (truncated to 4 KB)");
    lines.push("```");
    lines.push(input.stack.slice(0, 4_000));
    lines.push("```");
  }
  if (input.componentStack) {
    lines.push("");
    lines.push("## Component stack (truncated to 4 KB)");
    lines.push("```");
    lines.push(input.componentStack.slice(0, 4_000));
    lines.push("```");
  }
  return lines.join("\n");
}
