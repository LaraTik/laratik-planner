// `client-only` is the Next.js server-only marker; this file is
// already pure DOM code that is only used by client components.
// We skip the marker here so vitest + jsdom can import the file
// without the "client-only is not exported from package" error.
// The semantic guard is the call-site: any consumer of this
// helper must already be a `"use client"` module.

/**
 * focusFirstInvalid — Web Interface Guidelines §Forms:
 * "Errors inline next to fields; focus first error on submit."
 *
 * Called from a form's submit handler after the Server Action
 * returns. Resolution order:
 *   1. The first control carrying `aria-invalid="true"`.
 *   2. The first `required` control that has a name and is focusable.
 *   3. The form's first focusable descendant.
 *
 * The function honours `prefers-reduced-motion`: when set, the
 * scroll-into-view uses `block: "nearest"` instead of `"center"`
 * so the user's scroll position is preserved.
 *
 * Returns the focused element (or `null` if nothing could be
 * focused). The caller can use the return value to short-circuit
 * further error-surfacing logic.
 */
export function focusFirstInvalid(form: HTMLFormElement | null): HTMLElement | null {
  if (!form) return null;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1. First control the form has marked invalid.
  const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (invalid) {
    focusAndScroll(invalid, reduceMotion);
    return invalid;
  }

  // 2. First required control with a name (covers hidden inputs
  //    that fail validation but aren't visually marked yet).
  const required = form.querySelector<HTMLElement>(
    'input[required][name], select[required][name], textarea[required][name]',
  );
  if (required) {
    focusAndScroll(required, reduceMotion);
    return required;
  }

  // 3. First focusable descendant — covers cases where the
  //    field-error happens before render (rare; the form summary
  //    card is the fallback surface for those).
  const focusable = form.querySelector<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable) {
    focusAndScroll(focusable, reduceMotion);
    return focusable;
  }

  return null;
}

function focusAndScroll(el: HTMLElement, reduceMotion: boolean): void {
  // `preventScroll: true` lets the caller decide on the scroll
  // behaviour. When reduced-motion is requested, we still scroll
  // but only into the nearest viewport edge so the page doesn't
  // jump to centre.
  el.focus({ preventScroll: true });
  // `scrollIntoView` is not implemented in jsdom (used by the
  // unit test environment). Guard the call so the helper works
  // under both jsdom and a real browser.
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({
      block: reduceMotion ? "nearest" : "center",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }
}
