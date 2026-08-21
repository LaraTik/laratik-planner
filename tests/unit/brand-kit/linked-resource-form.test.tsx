import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `useFormStatus` is a React 19 server-action hook. Mock it so the
// form is always "not pending" in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

const actionMock = vi.hoisted(() => ({
  createLinkedResourceAction: vi.fn(),
  archiveLinkedResourceAction: vi.fn(),
}));
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/actions", () => ({
  createLinkedResourceAction: actionMock.createLinkedResourceAction,
  archiveLinkedResourceAction: actionMock.archiveLinkedResourceAction,
}));

import { useFormStatus } from "react-dom";
import { LinkedResourceForm } from "@/app/(app)/app/w/[slug]/brand-kit/linked-resource-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

function renderForm() {
  mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
  return render(<LinkedResourceForm slug="test-slug" />);
}

describe("LinkedResourceForm", () => {
  it("renders the provider select with all five canonical options", () => {
    renderForm();
    const select = document.getElementById("linked-resource-provider") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.required).toBe(true);
    const optionValues = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining(["google_drive", "figma", "canva", "dropbox", "other"]),
    );
    expect(optionValues).toHaveLength(5);
  });

  it("renders a name input with maxLength=120 and a <label htmlFor>", () => {
    renderForm();
    const name = document.getElementById("linked-resource-name") as HTMLInputElement;
    expect(name.tagName).toBe("INPUT");
    expect(name.required).toBe(true);
    expect(name.maxLength).toBe(120);
    const label = document.querySelector('label[for="linked-resource-name"]');
    expect(label).not.toBeNull();
  });

  it("renders a url input with a <label htmlFor> and a https-only pattern", () => {
    renderForm();
    const url = document.getElementById("linked-resource-url") as HTMLInputElement;
    expect(url.tagName).toBe("INPUT");
    expect(url.required).toBe(true);
    // The browser pattern blocks non-HTTPS submissions before the
    // server-action Zod check fires.
    expect(url.pattern).toBeTruthy();
    expect(url.pattern.startsWith("https://")).toBe(true);
    const label = document.querySelector('label[for="linked-resource-url"]');
    expect(label).not.toBeNull();
  });

  it("renders an optional description textarea with maxLength=280 and a <label htmlFor>", () => {
    renderForm();
    const description = document.getElementById(
      "linked-resource-description",
    ) as HTMLTextAreaElement;
    expect(description.tagName).toBe("TEXTAREA");
    expect(description.required).toBe(false);
    expect(description.maxLength).toBe(280);
    const label = document.querySelector('label[for="linked-resource-description"]');
    expect(label).not.toBeNull();
  });

  it("renders a Link resource submit button", () => {
    renderForm();
    const submit = screen.getByRole("button", { name: /link resource|add resource/i });
    expect(submit).toBeInTheDocument();
  });

  it("disables the submit button while the form action is pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    render(<LinkedResourceForm slug="test-slug" />);
    const submit = screen.getByRole("button", { name: /link resource|adding/i });
    expect(submit).toBeDisabled();
    expect(submit.textContent?.toLowerCase()).toContain("adding");
  });

  it("uses a 44px+ touch target on every interactive control", () => {
    renderForm();
    const form = screen.getByTestId("linked-resource-form");
    const controls = form.querySelectorAll<HTMLElement>("input, select, textarea, button");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.className).toMatch(/min-h-\[44px\]/);
    }
  });

  it("carries the linked-resource-form data-testid on the root form", () => {
    renderForm();
    expect(screen.getByTestId("linked-resource-form")).toBeInTheDocument();
  });

  it("does not submit (does not call the action) when the name is empty", async () => {
    actionMock.createLinkedResourceAction.mockClear();
    const user = userEvent.setup();
    renderForm();
    const url = document.getElementById("linked-resource-url") as HTMLInputElement;
    await user.type(url, "https://figma.com/file/x");
    await user.click(screen.getByRole("button", { name: /link resource|add resource/i }));
    expect(actionMock.createLinkedResourceAction).not.toHaveBeenCalled();
  });

  it("does not submit (does not call the action) when the url is empty", async () => {
    actionMock.createLinkedResourceAction.mockClear();
    const user = userEvent.setup();
    renderForm();
    const name = document.getElementById("linked-resource-name") as HTMLInputElement;
    await user.type(name, "Library");
    await user.click(screen.getByRole("button", { name: /link resource|add resource/i }));
    expect(actionMock.createLinkedResourceAction).not.toHaveBeenCalled();
  });

  it("does not call the action when the url is http:// (browser pattern blocks submission)", async () => {
    actionMock.createLinkedResourceAction.mockClear();
    const user = userEvent.setup();
    renderForm();
    // Fill the name, then try to submit with an http:// URL. The
    // browser's `pattern="https://.*"` should block the submission
    // synchronously.
    const name = document.getElementById("linked-resource-name") as HTMLInputElement;
    const url = document.getElementById("linked-resource-url") as HTMLInputElement;
    await user.type(name, "Library");
    await user.type(url, "http://figma.com/file/x");
    await user.click(screen.getByRole("button", { name: /link resource|add resource/i }));
    expect(actionMock.createLinkedResourceAction).not.toHaveBeenCalled();
  });

  it("renders a role=alert live region only when state.error is set", () => {
    actionMock.createLinkedResourceAction.mockResolvedValue({ error: "Name is required." });
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<LinkedResourceForm slug="test-slug" />);
    // Initial state is `{}` — no alert rendered.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resets the form fields to empty after a successful submission", async () => {
    actionMock.createLinkedResourceAction.mockResolvedValue({ success: true });
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const user = userEvent.setup();
    render(<LinkedResourceForm slug="test-slug" />);
    const name = document.getElementById("linked-resource-name") as HTMLInputElement;
    const url = document.getElementById("linked-resource-url") as HTMLInputElement;
    const description = document.getElementById(
      "linked-resource-description",
    ) as HTMLTextAreaElement;
    await user.type(name, "Master library");
    await user.type(url, "https://figma.com/file/example");
    await user.type(description, "Approved components");
    await user.click(screen.getByRole("button", { name: /link resource|add resource/i }));
    await waitFor(() => {
      expect(name.value).toBe("");
      expect(url.value).toBe("");
      expect(description.value).toBe("");
    });
  });
});
