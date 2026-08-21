import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AddChannelButton } from "@/app/(app)/app/w/[slug]/channels/add-channel-button";

/**
 * The Add channel CTA scrolls the inline form into view and focuses
 * the first field. We mock `document.querySelector` + `scrollIntoView`
 * to assert the wiring without actually scrolling the test viewport.
 */
function mockFormTarget() {
  const focusSpy = vi.fn();
  const scrollSpy = vi.fn();
  const firstField = { focus: focusSpy } as unknown as HTMLElement;
  const target = {
    scrollIntoView: scrollSpy,
    querySelector: vi.fn().mockReturnValue(firstField),
  } as unknown as HTMLElement;
  vi.spyOn(document, "querySelector").mockReturnValue(target);
  return { focusSpy, scrollSpy, target };
}

describe("AddChannelButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders a button with the right testid and aria-controls", () => {
    render(<AddChannelButton formId="channel-add-card" />);
    const btn = screen.getByTestId("channel-add-cta");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-controls", "channel-add-card");
    expect(btn).toHaveTextContent(/add channel/i);
  });

  it("scrolls the form into view and focuses the first field on click", () => {
    const { focusSpy, scrollSpy } = mockFormTarget();
    render(<AddChannelButton formId="channel-add-card" />);
    // fireEvent is synchronous; it does not require the fake-timer
    // workarounds that `userEvent.click` does. We then advance the
    // fake clock to trigger the deferred focus call.
    fireEvent.click(screen.getByTestId("channel-add-cta"));
    // Scroll is synchronous.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    // The setTimeout(200) defers the focus call; flush it.
    vi.advanceTimersByTime(250);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});
