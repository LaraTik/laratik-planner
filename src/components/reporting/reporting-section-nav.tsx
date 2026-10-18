import Link from "next/link";
import { cn } from "@/lib/utils";

export type ReportingSectionNavItem = {
  key: string;
  label: string;
  href: string;
};

/**
 * Shared local navigation for reporting workspaces.
 *
 * Keep application destinations in the persistent app sidebar. Use this
 * component only for report-local views that need deep links and preserve
 * their own filter state in the URL.
 */
export function ReportingSectionNav({
  ariaLabel,
  activeKey,
  items,
  testId,
}: {
  ariaLabel: string;
  activeKey: string;
  items: readonly ReportingSectionNavItem[];
  testId?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="border-border bg-surface sticky top-[4.5rem] z-10 flex gap-1 overflow-x-auto rounded-[var(--radius-card)] border p-1"
      data-testid={testId}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={activeKey === item.key ? "page" : undefined}
          className={cn(
            "text-label focus-visible:ring-focus-ring inline-flex min-h-10 shrink-0 items-center rounded-[var(--radius-control)] px-4 font-semibold focus:outline-none focus-visible:ring-2",
            activeKey === item.key
              ? "bg-primary text-primary-foreground"
              : "text-fg-secondary hover:bg-surface-subtle hover:text-fg-primary",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
