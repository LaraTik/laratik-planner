import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInOptions } from "@/app/signin/signin-options";

const noopAction = vi.fn(async () => undefined);

function renderOptions(props: Partial<React.ComponentProps<typeof SignInOptions>> = {}) {
  return render(
    <SignInOptions
      passwordAction={noopAction}
      googleAction={noopAction}
      magicLinkAction={noopAction}
      googleEnabled
      magicLinkEnabled
      passwordEnabled
      initialMethod="password"
      {...props}
    />,
  );
}

describe("SignInOptions", () => {
  it("keeps the default sign-in surface focused on one email field", () => {
    renderOptions();

    expect(screen.getByRole("textbox", { name: /email address/i })).toBeVisible();
    expect(screen.getByLabelText(/^password$/i)).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /sign in$/i })).toBeVisible();
  });

  it("switches to the magic-link form instead of adding a second email form", () => {
    renderOptions();

    fireEvent.click(screen.getByRole("button", { name: /use a sign-in link instead/i }));

    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email address/i })).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /send sign-in link/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /use password instead/i })).toBeVisible();
  });

  it("supports revealing and hiding the password with an accessible control", () => {
    renderOptions();
    const password = screen.getByLabelText(/^password$/i);

    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("starts with magic-link identity verification during first-time setup", () => {
    renderOptions({ initialMethod: "magic", passwordEnabled: false });

    expect(screen.getByRole("heading", { name: /email sign-in link/i })).toBeVisible();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use password instead/i })).not.toBeInTheDocument();
  });

  it("uses Google as the only action when setup has no magic-link provider", () => {
    renderOptions({
      initialMethod: "password",
      passwordEnabled: false,
      magicLinkEnabled: false,
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  it("does not render unavailable providers", () => {
    renderOptions({ googleEnabled: false, magicLinkEnabled: false });

    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign-in link/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });
});
