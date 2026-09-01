import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInOptions, type SignInCopy } from "@/app/signin/signin-options";

const noopAction = vi.fn(async () => undefined);

/**
 * `SignInOptions` is a Client Component. The Server Component
 * parent (`/app/signin/page.tsx`) is the only place that
 * resolves the message catalog; the client receives a
 * pre-translated `copy` prop. The fixture below is the
 * English shape — the Arabic shape is exercised by the
 * bilingual E2E matrix in `tests/e2e/`.
 */
const copy: SignInCopy = {
  emailLabel: "Email address",
  emailPlaceholder: "name@agency.com",
  passwordLabel: "Password",
  passwordPlaceholder: "Enter your password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  forgotPassword: "Forgot password?",
  rememberMe: "Keep me signed in for 30 days",
  submit: "Sign in",
  submitPending: "Signing in…",
  magicEyebrow: "Email sign-in link",
  magicBody: "We'll send a secure, one-time link to your work email.",
  magicSubmit: "Send sign-in link",
  magicSubmitPending: "Sending link…",
  magicSwitchToPassword: "Use password instead",
  magicSwitchToMagic: "Use a sign-in link instead",
  orSeparator: "or",
  otherMethodsSeparator: "Other sign-in options",
  googleSubmit: "Continue with Google",
  googleSubmitPending: "Opening Google…",
};

function renderOptions(props: Partial<React.ComponentProps<typeof SignInOptions>> = {}) {
  return render(
    <SignInOptions
      copy={copy}
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
