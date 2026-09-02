import "server-only";

import type { ZodError } from "zod";

/**
 * ActionState — the shape every content-workflow Server Action
 * returns to its form.
 *
 * The plan "5 fixes for the planning detail + list surface" §4
 * standardises this so:
 *   - Per-field errors map back to specific form fields
 *     (`fieldErrors`).
 *   - The form-level summary card reads `error` (top-of-form
 *     human-readable summary).
 *   - A non-redirecting success path can carry action-specific
 *     extras via `ok: true` (e.g. `brief: string` for the AI
 *     draft action). The form ignores them.
 *
 * Every field is optional so the existing form call-sites —
 * which read `state?.error` and `result.error` — keep working
 * unchanged. New code reads `state.fieldErrors` to highlight
 * the offending input.
 *
 * The single-shape design (instead of a strict discriminated
 * union) is deliberate: the upstream `useActionState` initial
 * state across the codebase is already `{ error?: string }`,
 * and the consumer code reads `state.error` without
 * narrowing. A strict union would force every existing call
 * site to add an `if (state.ok === false)` guard. The
 * trade-off: callers MUST treat `error` as the
 * failure signal and `ok: true` as the success signal.
 */
export interface ActionState<Field extends string = string> {
  /** Human-readable summary suitable for the form-level card. */
  error?: string;
  /**
   * Map of `fieldName → user-facing message`. The form passes
   * `fieldErrors[fieldName]` to `<FormField error={…}>` which
   * already handles `aria-invalid` + the `role="alert"`
   * paragraph + the `aria-describedby` wiring.
   */
  fieldErrors?: Partial<Record<Field, string>>;
  /**
   * `true` when the action completed without an error.
   * Non-redirecting actions (e.g. AI draft, format-payload
   * save, claim) set this so the form can clear the error
   * card after a successful save.
   */
  ok?: true;
}

/**
 * Derive the field-error map + form-level error string from a
 * Zod parse failure.
 *
 * Behaviour:
 *   - The first Zod issue for a given path wins (the user sees
 *     the most relevant error, not a stack).
 *   - The returned `error` string is a colon-joined summary
 *     suitable for the top-of-form summary card.
 *   - The returned `fieldErrors` object is a Partial keyed by
 *     the leaf path string. Empty when there are no issues.
 *   - The `fieldErrorFn` is the optional per-issue message
 *     formatter. Defaults to the issue's `message`; an action
 *     may pass a function that rewords the message for its own
 *     field (e.g. "Title is required" instead of "String must
 *     contain at least 2 character(s)").
 *
 * The helper is pure: it does not touch the database, the
 * session, or the network. It is therefore testable without any
 * fixture scaffolding.
 */
export function fieldErrorsFromZod<Field extends string>(
  error: ZodError,
  fieldErrorFn?: (issue: ZodError["issues"][number]) => string,
): Pick<ActionState<Field>, "error" | "fieldErrors"> {
  const fieldErrors: Partial<Record<Field, string>> = {};
  const summary: string[] = [];
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "") as Field;
    const message = fieldErrorFn ? fieldErrorFn(issue) : issue.message;
    if (field && !(field in fieldErrors)) {
      fieldErrors[field] = message;
    }
    summary.push(field ? `${field}: ${message}` : message);
  }
  return { error: summary.join("; "), fieldErrors };
}

/**
 * Build an `ActionState` from a runtime exception (e.g. a
 * service threw because the user is not allowed to transition
 * the workflow). Runtime errors do not have a Zod `path`, so
 * `fieldErrors` is left empty and the message bubbles up to
 * the form-level summary card.
 */
export function actionFailure<Field extends string = string>(
  error: unknown,
  fallback: string,
): ActionState<Field> {
  return {
    error: error instanceof Error ? error.message : fallback,
  };
}
