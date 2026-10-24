"use client";
import * as React from "react";

/**
 * useSuccessReset — drop-in helper for inline forms that should clear
 * their inputs after a successful server-action submission.
 *
 * The brand-kit has 6 inline forms (logo, color, typography, voice,
 * publishing rule, linked resource) that all follow the same pattern:
 * useActionState with a `{ error?, success? }` shape. Without this
 * hook, every form had to repeat the same:
 *
 *   const formRef = React.useRef<HTMLFormElement>(null);
 *   React.useEffect(() => {
 *     if (state?.success) formRef.current?.reset();
 *   }, [state?.success]);
 *
 * ...and the LogoForm + ColorForm + TypographyForm + VoiceForm did
 * not even do that — they kept the previous values, so the user had
 * to manually clear the fields before adding a second asset.
 *
 * Usage:
 *
 *   const [state, action] = useActionState(myAction, {});
 *   const formRef = React.useRef<HTMLFormElement>(null);
 *   useSuccessReset(state, formRef);
 *
 * The hook resets the form via the imperative `form.reset()` API
 * (not a setState), which is what React 19's `useActionState`
 * recommends (no React state in effects).
 */
export function useSuccessReset(
  state: { success?: boolean; error?: unknown } | undefined,
  ref: React.RefObject<HTMLFormElement | null>,
): void {
  const wasSuccess = React.useRef(false);
  React.useEffect(() => {
    const isSuccess = state?.success === true;
    if (isSuccess && !wasSuccess.current) {
      ref.current?.reset();
      wasSuccess.current = true;
    } else if (!isSuccess) {
      wasSuccess.current = false;
    }
  }, [state?.success, ref]);
}
