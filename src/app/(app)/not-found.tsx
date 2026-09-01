import Link from "next/link";
import { Building2, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Not-found for the (app) segment. Surfaces inside the authed
 * layout so the app chrome (sidebar, topbar) is preserved. Used
 * when a workspace slug does not match, when a workspace exists
 * but is archived, or when an agency detail page is missing.
 *
 * Per master prompt §9: never leave blank screens. The root
 * `/not-found` is the fallback for public routes (English-only
 * by §21); this one reads the user's profile locale and
 * presents bilingual copy with the in-app shell.
 */
export default async function AppNotFound() {
  const { t } = await tForActive();
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16" data-testid="app-not-found">
      <EmptyState
        icon={<FileQuestion className="h-10 w-10" aria-hidden="true" />}
        title={t("operational.workspaceNotFoundTitle")}
        description={t("operational.workspaceNotFoundBody")}
        action={
          <Button asChild>
            <Link href="/app">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {t("operational.workspaceNotFoundCta")}
            </Link>
          </Button>
        }
      />
    </div>
  );
}
