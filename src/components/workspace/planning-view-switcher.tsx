import Link from "next/link";
import { CalendarDays, Kanban, List, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlanningView = "list" | "board" | "calendar";

type PlanningViewSwitcherProps = {
  active: PlanningView;
  links: Record<PlanningView, string>;
  t: (key: string) => string;
};

const VIEWS: ReadonlyArray<{ key: PlanningView; labelKey: string; icon: LucideIcon }> = [
  { key: "list", labelKey: "planning.viewList", icon: List },
  { key: "board", labelKey: "planning.viewBoard", icon: Kanban },
  { key: "calendar", labelKey: "planning.viewCalendar", icon: CalendarDays },
];

export function PlanningViewSwitcher({ active, links, t }: PlanningViewSwitcherProps) {
  return (
    <nav
      aria-label={t("planning.viewSwitcherAria")}
      className="border-border bg-surface-subtle inline-flex max-w-full flex-wrap gap-1 rounded-[var(--radius-control)] border p-1"
      data-testid="planning-view-switcher"
    >
      {VIEWS.map(({ key, labelKey, icon: Icon }) => {
        const selected = key === active;
        const label = t(labelKey);
        return (
          <Link
            key={key}
            href={links[key]}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "text-label focus-visible:ring-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus:outline-none focus-visible:ring-2",
              selected
                ? "bg-surface text-fg-primary shadow-sm"
                : "text-fg-secondary hover:bg-surface hover:text-fg-primary",
            )}
            data-testid={`planning-view-${key}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
