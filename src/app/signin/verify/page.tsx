import { Mail } from "lucide-react";
import Link from "next/link";

/**
 * Magic-link "check your email" page. NextAuth redirects here after the
 * user submits the email form on /signin.
 */
export const metadata = { title: "Check your email" };

export default function VerifyRequestPage() {
  return (
    <main className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="border-border bg-surface rounded-full border p-3">
        <Mail className="text-primary h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
        Check your email
      </h1>
      <p className="text-body text-fg-secondary max-w-sm">
        We&apos;ve sent you a one-time sign-in link. Open it on this device to continue. The link
        expires in 10 minutes.
      </p>
      <p className="text-label text-fg-muted">
        Didn&apos;t get it? Check spam, or{" "}
        <Link
          href="/signin"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          try again
        </Link>
        .
      </p>
    </main>
  );
}
