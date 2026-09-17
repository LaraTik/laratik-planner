/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TabSwitchLink } from "@/components/planning/tab-switch-link";

/**
 * Regression tests for the broken "Open copy" / "Open preview" buttons
 * reported by planners on 2026-09-17.
 *
 * The bug: clicking `<Link href="#copy">` from inside the Content tab
 * updated the URL hash to `#copy` but the workspace tab stayed on
 * `content`. The cause was that Next.js's client-side router does not
 * fire the browser's native `hashchange` event when only the hash of
 * the current URL changes. `WorkspaceShell` listens for `hashchange`
 * to update `activeId`, so it never saw the navigation.
 *
 * These tests assert the fix: the wrapper sets the hash through the
 * History API and dispatches a `hashchange` event the shell picks up.
 */
describe("TabSwitchLink", () => {
  beforeEach(() => {
    // Start every test from a known pathname so the wrapper's
    // `isHashOnlyLink` check passes.
    window.history.replaceState(null, "", "/app/w/demo/planning/abc");
    window.location.hash = "";
  });

  it("renders a real anchor with the href", () => {
    render(
      <TabSwitchLink href="#copy" data-testid="ts">
        Open copy
      </TabSwitchLink>,
    );
    const anchor = screen.getByTestId("ts");
    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBe("#copy");
    expect(anchor).toHaveTextContent("Open copy");
  });

  it("updates the URL hash via History API on click", () => {
    render(<TabSwitchLink href="#copy">x</TabSwitchLink>);
    const anchor = screen.getByText("x");
    act(() => {
      fireEvent.click(anchor);
    });
    expect(window.location.hash).toBe("#copy");
  });

  it("dispatches a real hashchange event so WorkspaceShell can react", () => {
    const listener = vi.fn();
    window.addEventListener("hashchange", listener);
    render(<TabSwitchLink href="#preview">x</TabSwitchLink>);
    act(() => {
      fireEvent.click(screen.getByText("x"));
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("hashchange", listener);
  });

  it("calls onNavigated after a successful switch", () => {
    const onNavigated = vi.fn();
    render(
      <TabSwitchLink href="#copy" onNavigated={onNavigated}>
        x
      </TabSwitchLink>,
    );
    act(() => {
      fireEvent.click(screen.getByText("x"));
    });
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire hashchange when clicking a hash-only href that is already active", () => {
    window.location.hash = "#copy";
    const listener = vi.fn();
    window.addEventListener("hashchange", listener);
    render(<TabSwitchLink href="#copy">x</TabSwitchLink>);
    act(() => {
      fireEvent.click(screen.getByText("x"));
    });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("hashchange", listener);
  });

  it("falls back to Next.js routing for cross-page hashes", () => {
    // A hash on a different pathname must NOT be hijacked — let the
    // router take the user to that other page first. We can't truly
    // assert Next.js routing here without a full RouterProvider, but
    // we CAN assert the wrapper's own behaviour: the URL hash must
    // stay empty (we did not push `#section`) and we did not call
    // `preventDefault` on the event.
    const anchor = render(
      <TabSwitchLink href="/another/page#section" data-testid="cross">
        x
      </TabSwitchLink>,
    ).getByTestId("cross");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    expect(window.location.hash).toBe("");
    expect(event.defaultPrevented).toBe(false);
  });

  it("preserves a user-supplied onClick handler", () => {
    const userHandler = vi.fn();
    render(
      <TabSwitchLink href="#copy" onClick={userHandler}>
        x
      </TabSwitchLink>,
    );
    fireEvent.click(screen.getByText("x"));
    expect(userHandler).toHaveBeenCalledTimes(1);
  });
});
