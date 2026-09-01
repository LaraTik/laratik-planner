import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { FileQuestion } from "lucide-react";
import { tForResolved } from "@/messages";

/**
 * 404 — shown when no route matches (Next.js App Router).
 * Per master prompt §3.7: never leave blank screens.
 */
export default function NotFound() {
  const t = tForResolved("en");
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <EmptyState
        icon={<FileQuestion className="h-10 w-10" aria-hidden="true" />}
        title={t("errors.notFoundTitle")}
        description={t("errors.notFoundBody")}
        action={
          <Button asChild>
            <Link href="/app">{t("errors.backToMyWork")}</Link>
          </Button>
        }
      />
    </div>
  );
}
