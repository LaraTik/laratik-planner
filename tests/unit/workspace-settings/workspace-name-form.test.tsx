import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `useFormStatus` is a React 19 server-action hook. Mock it so the
// submit button is never "pending" in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: vi.fn() };
});

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/settings/actions", () => ({
  renameWorkspaceAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import {
  WorkspaceNameForm,
  type RenameWorkspaceCopy,
} from "@/app/(app)/app/a/[agencySlug]/w/[slug]/settings/_components/workspace-name-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

const copy: RenameWorkspaceCopy = {
  title: "Workspace name",
  description: "The name your team sees.",
  nameLabel: "Workspace name",
  nameHint: "Up to 80 characters.",
  urlLabel: "Workspace URL",
  urlHint: "The URL stays the same after a rename.",
  submit: "Rename workspace",
  saving: "Saving…",
  saved: "Workspace renamed.",
  unchanged: "That is already the workspace name.",
  errors: {
    unauthorized: "Sign in again.",
    not_found: "Workspace not found.",
    forbidden: "Only workspace managers can rename.",
    invalid_name: "Enter a name between 1 and 80 characters.",
    save_failed: "Could not rename. Try again.",
  },
};

function renderForm(overrides: Partial<Parameters<typeof WorkspaceNameForm>[0]> = {}) {
  mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
  return render(
    <WorkspaceNameForm
      slug="acme"
      agencySlug="acme"
      name="Acme"
      locale="en"
      canManage
      copy={copy}
      {...overrides}
    />,
  );
}

describe("WorkspaceNameForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("seeds the field with the current workspace name", () => {
    renderForm();
    expect(screen.getByLabelText(/workspace name/i)).toHaveValue("Acme");
  });

  it("shows the URL as read-only and explains it does not follow the rename", () => {
    renderForm();
    const url = screen.getByTestId("workspace-name-slug");
    expect(url).toHaveTextContent("/app/w/acme");
    // The slug is presented as a static paragraph, never an input —
    // a manager must not be able to edit the URL identity here.
    expect(screen.queryByLabelText(/workspace url/i)?.tagName).not.toBe("INPUT");
    expect(screen.getByText(/stays the same after a rename/i)).toBeInTheDocument();
  });

  it("does not render a form for a user without workspace_manager", () => {
    renderForm({ canManage: false });
    expect(screen.getByTestId("workspace-name-readonly")).toHaveTextContent("Acme");
    expect(screen.queryByRole("button", { name: copy.submit })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-name-slug")).not.toBeInTheDocument();
  });

  it("renders the submit control for a workspace manager", () => {
    renderForm();
    expect(screen.getByRole("button", { name: copy.submit })).toBeInTheDocument();
  });

  it("caps the input at the service's maximum length", () => {
    renderForm();
    // The 80-char bound lives in the shared command module, so the
    // UI cannot drift away from what the service accepts.
    expect(screen.getByLabelText(/workspace name/i)).toHaveAttribute("maxlength", "80");
  });
});
