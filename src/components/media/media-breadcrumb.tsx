import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Server-rendered breadcrumb for the library.
 *
 * Plan §3.3. Resolves the active folder's ancestor chain (server-side)
 * and renders a `<nav>` of clickable ancestors + a non-link final
 * segment. Uses logical CSS for RTL parity.
 */
export function MediaBreadcrumb({
  basePath,
  workspaceId,
  workspaceName,
  ancestors,
  currentLabel,
  showHome = false,
}: {
  basePath: string;
  workspaceId: string;
  workspaceName: string;
  ancestors: ReadonlyArray<{ id: string; name: string }>;
  currentLabel: string;
  showHome?: boolean;
}) {
  return (
    <nav
      aria-label="Folder path"
      className="text-body text-fg-secondary flex flex-wrap items-center gap-1"
    >
      <Link
        href={`${basePath}?workspace=${workspaceId}`}
        className="hover:text-fg-primary rounded-[var(--radius-control)] px-1"
      >
        {workspaceName}
      </Link>
      <ChevronLeft
        aria-hidden="true"
        className="text-fg-muted h-4 w-4 -scale-x-100 rtl:scale-x-100"
      />
      {showHome ? (
        <>
          <Link
            href={`${basePath}?workspace=${workspaceId}`}
            className="hover:text-fg-primary rounded-[var(--radius-control)] px-1"
          >
            Media
          </Link>
          <ChevronLeft
            aria-hidden="true"
            className="text-fg-muted h-4 w-4 -scale-x-100 rtl:scale-x-100"
          />
        </>
      ) : null}
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1">
          <Link
            href={`${basePath}?workspace=${workspaceId}&folder=${ancestor.id}`}
            className="hover:text-fg-primary rounded-[var(--radius-control)] px-1"
          >
            {ancestor.name}
          </Link>
          <ChevronLeft
            aria-hidden="true"
            className="text-fg-muted h-4 w-4 -scale-x-100 rtl:scale-x-100"
          />
        </span>
      ))}
      <span aria-current="page" className="text-fg-primary font-semibold">
        {currentLabel}
      </span>
    </nav>
  );
}
