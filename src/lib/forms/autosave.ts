/**
 * Shared timing constants for the planning detail's planner-facing
 * autosave UX.
 *
 * `AUTOSAVE_DEBOUNCE_MS` is the idle time before an Edit form
 * submits itself on the planning detail page (Brief tab +
 * Copy tab). 8 s was chosen over the original 800 ms because:
 *
 *   - 800 ms fired mid-thought on multi-word phrases and
 *     produced "endless activity logs" (every partial word
 *     became a revision), per planner feedback captured
 *     2026-09-18.
 *   - 8 s matches the typical pause-to-think cadence for copy
 *     editing and is short enough that a habitual tab-switch
 *     still feels free.
 *
 * The constant is exported so the format-aware content editor
 * and the audience-copy panel can share the same value without
 * drift — if you change it, both panels pick up the new value.
 */

export const AUTOSAVE_DEBOUNCE_MS = 8_000;
