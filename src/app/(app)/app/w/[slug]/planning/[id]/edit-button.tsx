import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Edit button for the content detail page header. Routers to the
 * dedicated edit screen so the form has its own URL (easier to
 * bookmark, share, and back-button out of).
 */
export function EditIdeaButton({
  workspaceSlug,
  contentItemId,
}: {
  workspaceSlug: string;
  contentItemId: string;
}) {
  return (
    <Button variant="secondary" size="sm" asChild>
      <Link href={`/app/w/${workspaceSlug}/planning/edit/${contentItemId}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
      </Link>
    </Button>
  );
}
