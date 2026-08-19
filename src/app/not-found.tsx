import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { FileQuestion } from "lucide-react";

/**
 * 404 — shown when no route matches (Next.js App Router).
 * Per master prompt §3.7: never leave blank screens.
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <EmptyState
        icon={<FileQuestion className="h-10 w-10" aria-hidden="true" />}
        title="Page not found"
        description="The page you tried to reach doesn't exist, or you don't have access to it."
        action={
          <Button asChild>
            <Link href="/app">Back to My Work</Link>
          </Button>
        }
      />
    </div>
  );
}
