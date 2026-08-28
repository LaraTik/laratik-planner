import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { SetPasswordForm } from "./set-password-form";

/**
 * First-login password reset page.
 *
 * Reachable only by users whose `mustChangePassword` flag is true
 * (the middleware at `src/middleware.ts` redirects every other path
 * away while the flag is set). The page also defensive-checks the
 * flag on the server: if the user navigates here by bookmarking it
 * after the flag is already cleared, the server bounces them to /app
 * without rendering the form.
 */
export const metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  if (!session.user.mustChangePassword) {
    redirect("/app");
  }
  return (
    <main className="bg-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6" data-testid="set-password-page">
        <div className="space-y-1 text-center">
          <h1 className="text-heading text-fg-primary">Set your password</h1>
          <p className="text-body text-fg-secondary">
            Your account was created by an administrator. Choose a new password to continue — you
            won&apos;t need the temporary one again.
          </p>
        </div>
        <SetPasswordForm />
      </div>
    </main>
  );
}
