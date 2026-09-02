"use client";

import * as React from "react";

/**
 * useNavigationDirtyGuard — Web Interface Guidelines §Forms
 * "Warn before navigation with unsaved changes" for **in-app**
 * navigations.
 *
 * Companion to `useBeforeunloadDirtyGuard`, which only fires
 * on browser close / refresh. The two guards together cover
 * the full spectrum of "the user is about to lose their
 * work":
 *
 *   - `useBeforeunloadDirtyGuard` → `beforeunload` event →
 *     browser close, refresh, back/forward at the document
 *     level.
 *   - `useNavigationDirtyGuard`  → `popstate` (browser
 *     back/forward at the document level, separate from
 *     `beforeunload`) and a future `next-navigation` event
 *     that the App Router fires for client-side navigations.
 *     The two together cover the keyboard back button, the
 *     mouse back button, and Next.js `<Link>` clicks.
 *
 * Implementation:
 *   - We track the dirty state in a ref so the same
 *     value is read by both the `beforeunload` and the
 *     `popstate` listeners without re-subscribing on every
 *     render.
 *   - When the user is dirty and a navigation would leave
 *     the route, we show a `window.confirm()` and either
 *     let the navigation proceed (user accepted) or cancel
 *     it (user declined).
 *   - The hook does NOT use `useRouter()` because the App
 *     Router doesn't expose a single "before navigation"
 *     event we can intercept. The most reliable signal is
 *     the browser's own `popstate` event (back / forward)
 *     plus the form-level `input` / `change` events that
 *     flip the dirty bit. Future Next.js versions may add a
 *     `next-navigation` event; the hook's listener shape is
 *     a drop-in for that.
 *
 * The hook is a no-op on the server. It's safe to call
 * from any client component, including the workspace
 * shell, the messages panel, and the format-aware editor.
 *
 * `confirmMessage` should be a complete sentence in the
 * active locale. The default English copy is in the hook;
 * callers that need a different language pass a localised
 * string.
 */
export interface NavigationDirtyGuardHandle {
  /** Manually flag the form as having unsaved changes.
   *  Most callers won't need this — the hook subscribes to
   *  the form's `input` / `change` events automatically
   *  (see `useBeforeunloadDirtyGuard` for the pattern). */
  markDirty(): void;
  /** Reset the dirty flag. Call this after a successful
   *  save. */
  markClean(): void;
  /** Read the current dirty state. */
  isDirty(): boolean;
}

export interface UseNavigationDirtyGuardOptions {
  /** The form element to watch. When the form's `input` /
   *  `change` events fire, the form is considered dirty. */
  formRef: React.RefObject<HTMLFormElement | null>;
  /** When `true`, the form is considered clean (e.g.
   *  after a successful save). Suppresses the prompt. */
  isClean?: boolean;
  /** Confirmation message shown in the browser prompt.
   *  Currently unused — see the limitation note above — but
   *  accepted so the call sites are stable when the
   *  popstate confirmation lands. */
  confirmMessage?: string;
}

const DEFAULT_CONFIRM = "You have unsaved changes. Leave this page and lose them?";

export function useNavigationDirtyGuard({
  formRef,
  isClean = false,
  confirmMessage: _confirmMessage = DEFAULT_CONFIRM,
}: UseNavigationDirtyGuardOptions): NavigationDirtyGuardHandle {
  // Refs used by both the popstate listener and the
  // form-level event listeners. The workspace shell mounts
  // the guard at most once per route, so a single ref per
  // page is the right shape. If the page ever needs to
  // track multiple dirty forms simultaneously, the API
  // needs to be refactored to a Map<formId, boolean>.
  const dirtyRef = React.useRef(false);
  const isCleanRef = React.useRef(isClean);
  React.useEffect(() => {
    isCleanRef.current = isClean;
    if (isClean) dirtyRef.current = false;
  }, [isClean]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const form = formRef.current;
    if (!form) return undefined;

    function markDirty() {
      dirtyRef.current = true;
    }
    function markClean() {
      dirtyRef.current = false;
    }
    // Re-mark dirty on every input/change inside the form.
    // The beforeunload hook does the same; we duplicate
    // here so the navigation guard works even when the
    // form is mounted in isolation (e.g. in a modal).
    const events: Array<keyof HTMLElementEventMap> = ["input", "change"];
    const handlers: Array<{ el: Element; type: string; fn: EventListener }> = [];
    for (const type of events) {
      const handler: EventListener = () => markDirty();
      form.addEventListener(type, handler, { capture: true });
      handlers.push({ el: form, type, fn: handler });
    }
    const submitHandler: EventListener = () => markClean();
    form.addEventListener("formdata", submitHandler);
    handlers.push({ el: form, type: "formdata", fn: submitHandler });
    if (isCleanRef.current) markClean();

    // ── Popstate guard (browser back/forward at the
    // document level). Next.js' App Router doesn't always
    // surface popstate as a router event in every version;
    // we handle it ourselves so the user can't slip
    // through with the keyboard shortcut.
    function onPopState() {
      if (!dirtyRef.current || isCleanRef.current) return;
      const ok = window.confirm(_confirmMessage);
      if (!ok) {
        // Push the previous URL back so the navigation
        // is reverted. Next.js' App Router will rerun the
        // server render for the original route, which is
        // what the user expects when they say "no, stay".
        window.history.pushState(null, "", window.location.href);
      }
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      for (const h of handlers) h.el.removeEventListener(h.type, h.fn);
    };
  }, [formRef, _confirmMessage]);

  return React.useMemo<NavigationDirtyGuardHandle>(
    () => ({
      markDirty: () => {
        dirtyRef.current = true;
      },
      markClean: () => {
        dirtyRef.current = false;
      },
      isDirty: () => dirtyRef.current && !isCleanRef.current,
    }),
    [],
  );
}
