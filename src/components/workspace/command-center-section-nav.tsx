"use client";

import { useScrollSpyActiveId } from "@/lib/nav/use-scroll-spy-active-id";
import { cn } from "@/lib/utils";

export function CommandCenterSectionNav({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ id: string; label: string }>;
}) {
  const activeId = useScrollSpyActiveId(items.map(({ id }) => ({ id })));

  return (
    <nav
      aria-label={title}
      className="border-border bg-surface-subtle flex gap-1 overflow-x-auto rounded-[var(--radius-control)] border p-1"
      data-testid="command-center-sections"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={activeId === item.id ? "location" : undefined}
          className={cn(
            "text-label focus-visible:ring-focus-ring shrink-0 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 font-semibold transition-colors focus:outline-none focus-visible:ring-2",
            activeId === item.id
              ? "bg-surface text-fg-primary"
              : "text-fg-secondary hover:bg-surface hover:text-fg-primary",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
