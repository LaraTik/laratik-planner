import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentForm } from "@/components/comments/comment-form";
import { tFor } from "@/messages";

const t = tFor("en");

// `useFormStatus` is a React 19 server-action hook that only works
// inside a <form action>. Mock it so we can drive `pending` from the
// test instead of waiting for a real submission.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

// CommentForm imports a server action; the test never invokes it, so
// a no-op stub keeps the module graph small and avoids pulling
// next-auth (which has a known Vitest/Node ESM issue) into the bundle.
vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  createCommentAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";

const mockedUseFormStatus = vi.mocked(useFormStatus);

function renderForm(
  overrides: Partial<React.ComponentProps<typeof CommentForm>> = {},
  onCancel = vi.fn(),
  onPosted = vi.fn(),
) {
  return render(
    <CommentForm
      workspaceSlug="acme"
      contentItemId="ci-1"
      canPostClientVisible
      canPostInternal
      onCancel={onCancel}
      onPosted={onPosted}
      t={t}
      {...overrides}
    />,
  );
}

describe("CommentForm", () => {
  it("renders a textarea with the right placeholder for a new comment", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm();
    const ta = screen.getByPlaceholderText(/Add a comment/i) as HTMLTextAreaElement;
    expect(ta).toBeInTheDocument();
    expect(ta.name).toBe("body");
    expect(ta.required).toBe(true);
  });

  it("uses 'Write a reply…' as the placeholder when parentCommentId is provided", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm({ parentCommentId: "c-parent" });
    expect(screen.getByPlaceholderText(/reply/i)).toBeInTheDocument();
  });

  it("hides the parent hidden input when there is no parentCommentId", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const { container } = renderForm();
    expect(container.querySelector('input[name="parentCommentId"]')).toBeNull();
  });

  it("emits the parent hidden input when parentCommentId is provided", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const { container } = renderForm({ parentCommentId: "c-parent" });
    const input = container.querySelector('input[name="parentCommentId"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("c-parent");
  });

  it("always emits the contentItemId hidden input", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const { container } = renderForm();
    const input = container.querySelector('input[name="contentItemId"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("ci-1");
  });

  it("defaults visibility to 'client' when the user can post client-visible", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm();
    // The new composer renders visibility as a chip toggle
    // (`aria-pressed` button) with `name="visibility"` and
    // `value="client" | "internal"`. The pressed chip is the
    // value the form serialises.
    const clientChip = screen.getByTestId("comment-visibility-client");
    expect(clientChip).toHaveAttribute("aria-pressed", "true");
    expect(clientChip).toHaveAttribute("value", "client");
  });

  it("defaults visibility to 'internal' when the user cannot post client-visible", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm({ canPostClientVisible: false });
    const internalChip = screen.getByTestId("comment-visibility-internal");
    expect(internalChip).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the 'Client visible' chip when canPostClientVisible is false", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm({ canPostClientVisible: false });
    expect(screen.queryByTestId("comment-visibility-client")).toBeNull();
  });

  it("hides the 'Internal only' chip when canPostInternal is false", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm({ canPostInternal: false });
    expect(screen.queryByTestId("comment-visibility-internal")).toBeNull();
  });

  it("shows all four label options", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm();
    expect(screen.getByRole("option", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Question" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Feedback" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Decision" })).toBeInTheDocument();
  });

  it("defaults the label to 'general'", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm();
    const select = document.querySelector('select[name="label"]') as HTMLSelectElement;
    expect(select.value).toBe("general");
  });

  it("labels the submit button 'Comment' for a top-level comment", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm();
    expect(screen.getByTestId("comment-composer-submit")).toHaveTextContent(/^Comment$/);
  });

  it("labels the submit button 'Reply' when parentCommentId is set", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm({ parentCommentId: "c-parent" });
    expect(screen.getByTestId("comment-composer-submit")).toHaveTextContent(/^Reply$/);
  });

  it("disables the textarea and the visibility/label controls while pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    renderForm();
    expect(screen.getByPlaceholderText(/Add a comment/i)).toBeDisabled();
    // Label select is still a `<select>` in the new composer.
    const labelSel = document.querySelector('select[name="label"]') as HTMLSelectElement;
    expect(labelSel).toBeDisabled();
    // Visibility chips are buttons; they keep their `disabled`
    // attribute while pending so a user can't toggle mid-submit.
    const clientChip = screen.getByTestId("comment-visibility-client");
    expect(clientChip).toBeDisabled();
  });

  it("renders the Cancel button when onCancel is provided", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderForm({}, vi.fn());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("hides the Cancel button when onCancel is not provided", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(
      <CommentForm
        workspaceSlug="acme"
        contentItemId="ci-1"
        canPostClientVisible
        canPostInternal
        t={t}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("calls onCancel when the Cancel button is clicked", async () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const onCancel = vi.fn();
    renderForm({}, onCancel);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
