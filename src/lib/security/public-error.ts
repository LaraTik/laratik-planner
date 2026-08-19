export type PublicProviderError = {
  code: "provider_unavailable";
  message: string;
};

/** Return a stable user-facing message without leaking an upstream response body. */
export function publicProviderError(
  provider: "ai" | "email" | "oauth",
  cause: unknown,
): PublicProviderError {
  void cause;
  const labels = {
    ai: "AI generation",
    email: "Email delivery",
    oauth: "Sign-in",
  } as const;

  return {
    code: "provider_unavailable",
    message: `${labels[provider]} is temporarily unavailable. Please try again.`,
  };
}
