/**
 * getErrorMessage — extract a human-readable message from an unknown
 * error. Replaces the duplicated `err instanceof Error ? err.message :
 * "Unknown error"` pattern that was copy-pasted across the brand-kit
 * surface (and across the rest of the app).
 *
 * Why a utility:
 *   - One place to update the fallback copy.
 *   - Subclass-friendly (works with DOMException, Stripe.errors, etc).
 *   - Testable in isolation.
 *
 * Usage:
 *   try { ... } catch (err) { toast.error(getErrorMessage(err)) }
 */
export function getErrorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return fallback;
}
