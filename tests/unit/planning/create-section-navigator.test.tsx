import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateSectionNavigator } from "@/components/planning/create-section-navigator";

describe("CreateSectionNavigator", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("switches to Create, scrolls to the selected section, and restores focus", async () => {
    render(
      <div>
        <CreateSectionNavigator
          label="Create sections"
          sections={[{ id: "assets-versions", label: "Assets" }]}
        />
        <section id="assets-versions" tabIndex={-1}>
          <p>Assets</p>
        </section>
      </div>,
    );

    const hashListener = vi.fn();
    window.addEventListener("hashchange", hashListener);
    fireEvent.click(screen.getByTestId("create-section-nav-assets-versions"));

    expect(window.location.hash).toBe("#create");
    expect(hashListener).toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("assets-versions")),
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    window.removeEventListener("hashchange", hashListener);
  });

  it("supports the Publish workspace without duplicating the navigator", async () => {
    render(
      <div>
        <CreateSectionNavigator
          label="Publish sections"
          workspaceHash="#publish"
          testId="publish-section-navigator"
          sections={[{ id: "publish-outcomes", label: "Outcomes" }]}
        />
        <section id="publish-outcomes" tabIndex={-1}>
          <p>Outcomes</p>
        </section>
      </div>,
    );

    fireEvent.click(screen.getByTestId("create-section-nav-publish-outcomes"));

    expect(window.location.hash).toBe("#publish");
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("publish-outcomes")),
    );
  });
});
