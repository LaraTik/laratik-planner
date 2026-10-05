/**
 * Workspace-tab change bus.
 *
 * `WorkspaceShell` is the single owner of which workspace tab is
 * active. It mirrors that state into the URL with
 * `window.history.pushState`, because the shell must not reload the
 * page to switch tabs.
 *
 * `pushState` does **not** fire the browser's native `hashchange`
 * event. Anything that watched the URL hash to learn the active tab
 * therefore only ever saw the *initial* deep link, never a tab the
 * operator clicked. `WorkflowRail` did exactly that, which is why the
 * rail's publish-only cards (Blockers, Publishing integrations,
 * Channel readiness) stayed hidden for anyone who reached the page
 * normally and clicked "Publish" — they only appeared for a full
 * navigation that changed the hash natively.
 *
 * The fix is not a second source of truth read back out of the URL. It
 * is an explicit notification from the one component that already knows
 * the answer, delivered to whoever needs to react.
 */

const EVENT_NAME = "laratik:workspace-tab-change";

export interface WorkspaceTabChangeDetail {
  /** Canonical tab id, e.g. `publish`. */
  tabId: string;
}

/**
 * Announce that the active workspace tab changed. Called by
 * `WorkspaceShell` immediately after it updates the URL.
 */
export function announceWorkspaceTabChange(tabId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceTabChangeDetail>(EVENT_NAME, { detail: { tabId } }),
  );
}

/**
 * Subscribe to active-tab changes. Fires for a real hash change (deep
 * link, back/forward, manual edit) *and* for a client-side tab switch
 * driven by `WorkspaceShell`.
 */
export function subscribeToWorkspaceTabChanges(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onHashChange = () => onChange();
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener(EVENT_NAME, onHashChange);
  return () => {
    window.removeEventListener("hashchange", onHashChange);
    window.removeEventListener(EVENT_NAME, onHashChange);
  };
}

/**
 * Read the active tab id from the URL. Used as the
 * `useSyncExternalStore` snapshot so the value is read on the client
 * only — the server has no `window`, and rendering the rail's publish
 * cards from a server-side hash guess would produce a hydration
 * mismatch.
 */
export function readWorkspaceTabFromHash(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}
