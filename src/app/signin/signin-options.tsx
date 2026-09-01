"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SignInMethod = "password" | "magic";
type FormAction = (formData: FormData) => void | Promise<void>;

/**
 * Localized copy bundle. The Server Component parent resolves
 * every string through the message catalog and hands them to
 * this client component as a single `copy` prop — the client
 * never reaches for the catalog itself. Adding a new visible
 * string is a two-step change: add the key to both catalogs,
 * add the field to this interface, and read it from `copy` in
 * the JSX. The unit test suite pins the interface shape.
 */
export type SignInCopy = {
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  showPassword: string;
  hidePassword: string;
  forgotPassword: string;
  rememberMe: string;
  submit: string;
  submitPending: string;
  magicEyebrow: string;
  magicBody: string;
  magicSubmit: string;
  magicSubmitPending: string;
  magicSwitchToPassword: string;
  magicSwitchToMagic: string;
  orSeparator: string;
  otherMethodsSeparator: string;
  googleSubmit: string;
  googleSubmitPending: string;
};

export function SignInOptions({
  copy,
  passwordAction,
  googleAction,
  magicLinkAction,
  googleEnabled,
  magicLinkEnabled,
  passwordEnabled,
  initialMethod,
}: {
  copy: SignInCopy;
  passwordAction: FormAction;
  googleAction: FormAction;
  magicLinkAction: FormAction;
  googleEnabled: boolean;
  magicLinkEnabled: boolean;
  passwordEnabled: boolean;
  initialMethod: SignInMethod;
}) {
  const [method, setMethod] = useState<SignInMethod>(initialMethod);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-5">
      {method === "password" && passwordEnabled ? (
        <form action={passwordAction} className="space-y-5" data-testid="password-signin-form">
          <FormField id="signin-email" label={copy.emailLabel} required>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              required
              placeholder={copy.emailPlaceholder}
              className="h-11"
            />
          </FormField>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="signin-password" className="text-label text-fg-primary font-medium">
                {copy.passwordLabel}
              </label>
              <Link
                href="/signin/forgot-password"
                className="text-label text-primary hover:text-primary-hover focus-visible:ring-focus-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {copy.forgotPassword}
              </Link>
            </div>
            <div className="relative">
              <Input
                id="signin-password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                placeholder={copy.passwordPlaceholder}
                className="h-11 pe-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring absolute inset-y-0 end-0 flex min-w-11 cursor-pointer items-center justify-center rounded-e-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <label
            htmlFor="signin-remember"
            className="text-label text-fg-secondary flex min-h-11 cursor-pointer items-center gap-2.5"
          >
            <input
              id="signin-remember"
              name="remember"
              type="checkbox"
              value="on"
              className="border-border text-primary focus-visible:ring-focus-ring bg-surface h-4 w-4 cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            />
            {copy.rememberMe}
          </label>

          <FormSubmitButton
            label={copy.submit}
            pendingLabel={copy.submitPending}
            className="w-full"
            size="lg"
          />
        </form>
      ) : method === "magic" && magicLinkEnabled ? (
        <div className="space-y-5" data-testid="magic-link-signin-form">
          <div className="space-y-1 text-center" aria-live="polite">
            <span className="bg-primary-subtle text-primary mx-auto flex h-10 w-10 items-center justify-center rounded-full">
              <Mail className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-title-card text-fg-primary pt-2 font-semibold">
              {copy.magicEyebrow}
            </h2>
            <p className="text-body text-fg-secondary">{copy.magicBody}</p>
          </div>

          <form action={magicLinkAction} className="space-y-5">
            <FormField id="magic-email" label={copy.emailLabel} required>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                required
                placeholder={copy.emailPlaceholder}
                className="h-11"
              />
            </FormField>
            <FormSubmitButton
              label={copy.magicSubmit}
              pendingLabel={copy.magicSubmitPending}
              className="w-full"
              size="lg"
            />
          </form>
        </div>
      ) : null}

      {(googleEnabled || (passwordEnabled && magicLinkEnabled)) && (
        <div className="space-y-3">
          {googleEnabled ? (
            <>
              {(passwordEnabled || magicLinkEnabled) && (
                <div
                  className="flex items-center gap-3"
                  role="separator"
                  aria-label={copy.otherMethodsSeparator}
                >
                  <hr className="border-border flex-1" />
                  <span className="text-label text-fg-muted">{copy.orSeparator}</span>
                  <hr className="border-border flex-1" />
                </div>
              )}
              <form action={googleAction}>
                <FormSubmitButton
                  label={
                    <>
                      <GoogleIcon className="h-4 w-4" />
                      {copy.googleSubmit}
                    </>
                  }
                  pendingLabel={copy.googleSubmitPending}
                  variant={passwordEnabled || magicLinkEnabled ? "secondary" : "default"}
                  className="w-full"
                  size="lg"
                />
              </form>
            </>
          ) : null}

          {passwordEnabled && magicLinkEnabled ? (
            <Button
              type="button"
              variant="ghost"
              className="text-primary w-full"
              onClick={() => setMethod(method === "password" ? "magic" : "password")}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {method === "password" ? copy.magicSwitchToMagic : copy.magicSwitchToPassword}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.35 11.1H12v3.83h5.34c-.23 1.45-1.7 4.25-5.34 4.25-3.21 0-5.83-2.66-5.83-5.93s2.62-5.93 5.83-5.93c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 4.55 14.55 3.5 12 3.5 6.85 3.5 2.7 7.66 2.7 12.8s4.15 9.3 9.3 9.3c5.37 0 8.92-3.77 8.92-9.08 0-.61-.07-1.08-.17-1.92z" />
    </svg>
  );
}
