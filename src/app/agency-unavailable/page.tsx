import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export default function AgencyUnavailablePage() {
  return (
    <main className="bg-canvas grid min-h-screen place-items-center p-6">
      <Card padding="lg" className="max-w-lg space-y-3">
        <CardTitle>Agency access is paused</CardTitle>
        <CardDescription>
          This agency is suspended or archived. Its content is preserved, but new and existing
          tenant operations are unavailable until a platform administrator restores access.
        </CardDescription>
        <Link
          href="/signin"
          className="text-primary text-body font-semibold underline-offset-4 hover:underline"
        >
          Return to sign in
        </Link>
      </Card>
    </main>
  );
}
