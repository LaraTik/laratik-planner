import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `useFormStatus` is a React 19 server-action hook that only works
// inside a <form action>. Mock it so the form is always "not pending"
// in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

// Stub the action — we only assert the form shape and the action
// call signature, not the server side. The action is wired via
// `useActionState`, so we keep a stable reference across renders.
const actionMock = vi.hoisted(() => ({
  createPublishingRuleAction: vi.fn(),
  archivePublishingRuleAction: vi.fn(),
}));
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/actions", () => ({
  createPublishingRuleAction: actionMock.createPublishingRuleAction,
  archivePublishingRuleAction: actionMock.archivePublishingRuleAction,
}));

import { useFormStatus } from "react-dom";
import { PublishingRuleForm } from "@/app/(app)/app/w/[slug]/brand-kit/publishing-rule-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

function renderForm() {
  mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
  return render(<PublishingRuleForm slug="test-slug" />);
}

describe("PublishingRuleForm", () => {
  it("renders the ruleType select with all five canonical options", () => {
    renderForm();
    // The form uses an explicit `id` so we read the control by id
    // (avoids label-text collisions between "Rule type" and "Rule").
    const select = document.getElementById("publishing-rule-type") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.required).toBe(true);
    const optionValues = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining(["alt_text", "hashtag", "compliance", "channel", "general"]),
    );
    expect(optionValues).toHaveLength(5);
  });

  it("renders a required title input with maxLength=80 and a <label htmlFor>", () => {
    renderForm();
    const title = document.getElementById("publishing-rule-title") as HTMLInputElement;
    expect(title.tagName).toBe("INPUT");
    expect(title.required).toBe(true);
    expect(title.maxLength).toBe(80);
    const label = document.querySelector('label[for="publishing-rule-title"]');
    expect(label).not.toBeNull();
  });

  it("renders a required content textarea with maxLength=1000 and a <label htmlFor>", () => {
    renderForm();
    const content = document.getElementById("publishing-rule-content") as HTMLTextAreaElement;
    expect(content.tagName).toBe("TEXTAREA");
    expect(content.required).toBe(true);
    expect(content.maxLength).toBe(1000);
    const label = document.querySelector('label[for="publishing-rule-content"]');
    expect(label).not.toBeNull();
  });

  it("renders a Create rule submit button", () => {
    renderForm();
    const submit = screen.getByRole("button", { name: /create rule/i });
    expect(submit).toBeInTheDocument();
  });

  it("disables the submit button while the form action is pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    render(<PublishingRuleForm slug="test-slug" />);
    const submit = screen.getByRole("button", { name: /create rule|creating/i });
    expect(submit).toBeDisabled();
    expect(submit.textContent?.toLowerCase()).toContain("creating");
  });

  it("uses a 44px+ touch target on every interactive control", () => {
    renderForm();
    const form = screen.getByTestId("publishing-rule-form");
    const controls = form.querySelectorAll<HTMLElement>("input, select, textarea, button");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      // `min-h-[44px]` is the canonical touch-target class used by
      // the brand-kit / channels forms on mobile. We assert the
      // class is present rather than computing rendered height
      // (jsdom does not lay out elements).
      expect(control.className).toMatch(/min-h-\[44px\]/);
    }
  });

  it("carries the publishing-rule-form data-testid on the root form", () => {
    renderForm();
    expect(screen.getByTestId("publishing-rule-form")).toBeInTheDocument();
  });

  it("does not submit (does not call the action) when the title is empty", async () => {
    actionMock.createPublishingRuleAction.mockClear();
    const user = userEvent.setup();
    renderForm();
    const content = document.getElementById("publishing-rule-content") as HTMLTextAreaElement;
    await user.type(content, "Some content");
    // Leave the title empty and try to submit. The form has
    // `required` on title so the browser blocks the submit
    // synchronously — the action must not be invoked.
    await user.click(screen.getByRole("button", { name: /create rule/i }));
    expect(actionMock.createPublishingRuleAction).not.toHaveBeenCalled();
  });

  it("renders a role=alert live region only when state.error is set", () => {
    actionMock.createPublishingRuleAction.mockResolvedValue({ error: "Title is required." });
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<PublishingRuleForm slug="test-slug" />);
    // Initial state is `{}` — no alert rendered.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resets the form fields to empty after a successful submission", async () => {
    actionMock.createPublishingRuleAction.mockResolvedValue({ success: true });
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const user = userEvent.setup();
    render(<PublishingRuleForm slug="test-slug" />);
    const title = document.getElementById("publishing-rule-title") as HTMLInputElement;
    const content = document.getElementById("publishing-rule-content") as HTMLTextAreaElement;
    await user.type(title, "Alt text");
    await user.type(content, "Describe the image.");
    await user.click(screen.getByRole("button", { name: /create rule/i }));
    // After a successful submission the form should clear its
    // controlled fields back to empty.
    await waitFor(() => {
      expect(title.value).toBe("");
      expect(content.value).toBe("");
    });
  });
});
