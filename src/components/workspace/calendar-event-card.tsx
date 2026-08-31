import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant, humanStatus, humanFormat } from "@/lib/content/status";
import { cn } from "@/lib/utils";

/**
 * CalendarEventCard — the day-cell chip on the editorial calendar
 * (`/app/w/[slug]/calendar`). Extracted from the inlined `<Link>`
 * block in the calendar page so a second consumer (board / client
 * calendar / future agenda view) can render the same status+format
 * chip without re-implementing the badge variant + left-border accent.
 *
 * The status is represented by **text + color** (per master prompt §3
 * accessibility rule: status never uses color alone). The format
 * shows as a humanized label.
 */
export type CalendarEventCardProps = {
  id: string;
  href: string;
  title: string;
  status: string;
  format: string;
};

const LEFT_BORDER_BY_VARIANT: Record<string, string> = {
  success: "border-s-success",
  warning: "border-s-warning",
  danger: "border-s-danger",
  info: "border-s-info",
  primary: "border-s-primary",
  default: "border-s-border",
};

export function CalendarEventCard({ id, href, title, status, format }: CalendarEventCardProps) {
  const variant = statusBadgeVariant(status);
  const leftBorder = LEFT_BORDER_BY_VARIANT[variant] ?? LEFT_BORDER_BY_VARIANT.default;
  return (
    <Link
      href={href}
      data-testid={`calendar-event-${id}`}
      className={cn(
        "hover:border-primary block rounded border p-2 transition-colors",
        // Per status: a left border in the badge color so the day cell
        // shows the status at a glance without competing with the
        // badge inside.
        leftBorder,
        "border-s-4",
      )}
    >
      <p className="text-label text-fg-primary truncate font-semibold">{title}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <Badge variant={variant} className="text-[10px]">
          {humanStatus(status)}
        </Badge>
        <span className="text-label text-fg-muted truncate">{humanFormat(format)}</span>
      </div>
    </Link>
  );
}
