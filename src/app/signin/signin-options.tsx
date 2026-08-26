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

export function SignInOptions({
  passwordAction,
  googleAction,
  magicLinkAction,
  googleEnabled,
  magicLinkEnabled,
  passwordEnabled,
  initialMethod,
}: {
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
          <FormField id="signin-email" label="Email address" required>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="name@agency.com"
              className="h-11"
            />
          </FormField>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="signin-password" className="text-label text-fg-primary font-medium">
                Password
              </label>
              <Link
                href="/signin/forgot-password"
                className="text-label text-primary hover:text-primary-hover focus-visible:ring-focus-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="signin-password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                className="h-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring absolute inset-y-0 right-0 flex min-w-11 cursor-pointer items-center justify-center rounded-r-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                aria-label={showPassword ? "Hide password" : "Show password"}
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
            Keep me signed in for 30 days
          </label>

          <FormSubmitButton
            label="Sign in"
            pendingLabel="Signing in…"
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
              Email sign-in link
            </h2>
            <p className="text-body text-fg-secondary">
              We&apos;ll send a secure, one-time link to your work email.
            </p>
          </div>

          <form action={magicLinkAction} className="space-y-5">
            <FormField id="magic-email" label="Email address" required>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="name@agency.com"
                className="h-11"
              />
            </FormField>
            <FormSubmitButton
              label="Send sign-in link"
              pendingLabel="Sending link…"
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
                  aria-label="Other sign-in options"
                >
                  <hr className="border-border flex-1" />
                  <span className="text-label text-fg-muted">or</span>
                  <hr className="border-border flex-1" />
                </div>
              )}
              <form action={googleAction}>
                <FormSubmitButton
                  label={
                    <>
                      <GoogleIcon className="h-4 w-4" />
                      Continue with Google
                    </>
                  }
                  pendingLabel="Opening Google…"
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
              {method === "password" ? "Use a sign-in link instead" : "Use password instead"}
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
