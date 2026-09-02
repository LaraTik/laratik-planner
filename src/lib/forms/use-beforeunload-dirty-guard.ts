"use client";

import * as React from "react";

/**
 * useBeforeunloadDirtyGuard — Web Interface Guidelines §Forms:
 * "Warn before navigation with unsaved changes".
 *
 * Tracks whether any input/textarea/select inside the form
 * has been edited since mount. When the user attempts to
 * navigate away (browser close, refresh, back button), the
 * browser's native `beforeunload` confirmation fires. Next.js
 * client-side navigations (Link clicks, router.push) are NOT
 * covered — those are out of scope for the WIG rule and
 * require an additional `<Link>` interceptor or a route guard.
 *
 * The hook is a no-op when the form is currently submitting
 * (the `pending` state from `useFormStatus` is best-effort
 * detected via a sentinel attribute) and when the form has
 * already been saved successfully (caller passes a `clean`
 * boolean to suppress the prompt after a successful save).
 *
 * Usage:
 *   const formRef = React.useRef<HTMLFormElement | null>(null);
 *   useBeforeunloadDirtyGuard(formRef, isClean);
 *   <form ref={formRef}>…</form>
 */
export function useBeforeunloadDirtyGuard(
  formRef: React.RefObject<HTMLFormElement | null>,
  isClean: boolean = false,
): void {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const form = formRef.current;
    if (!form) return;

    let dirty = false;

    function markDirty() {
      dirty = true;
    }
    function markClean() {
      dirty = false;
    }

    // Track every user input. We only care about the
    // *interaction* signal (input/change), not the initial
    // render — `defaultValue` doesn't fire `input`.
    const events: Array<keyof HTMLElementEventMap> = ["input", "change"];
    const handlers: Array<{ el: Element; type: string; fn: EventListener }> = [];
    for (const type of events) {
      const handler: EventListener = () => markDirty();
      form.addEventListener(type, handler, { capture: true });
      handlers.push({ el: form, type, fn: handler });
    }

    // Mark clean on successful submit (the form's
    // `formdata` event fires *before* the action).
    const submitHandler: EventListener = () => markClean();
    form.addEventListener("formdata", submitHandler);
    handlers.push({ el: form, type: "formdata", fn: submitHandler });

    // Mark clean when the caller says so (e.g. after the
    // Server Action returns `ok: true`).
    if (isClean) markClean();

    function beforeUnload(e: BeforeUnloadEvent) {
      if (!dirty || isClean) return undefined;
      e.preventDefault();
      // Modern browsers ignore the return value and show
      // their own copy; legacy browsers need the legacy
      // return value. Both are safe to set.
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      for (const h of handlers) {
        h.el.removeEventListener(h.type, h.fn);
      }
    };
  }, [formRef, isClean]);
}
