import Link from "next/link";
import { cn } from "@/lib/utils";
import { workspaceSeriesVar } from "@/lib/planning/workspace-color";

/**
 * WorkspaceLegend — the colour key for the agency-wide calendar, and
 * the workspace filter, in one control.
 *
 * WHY A LEGEND AT ALL
 * A coloured dot only carries meaning if the reader can decode it. The
 * legend lists every workspace in the agency with the exact dot the
 * cards use, so "the blue one" resolves to a name. Making each chip a
 * link to the same calendar filtered to that workspace means the key
 * doubles as the primary navigation control — click a client, isolate
 * it — instead of being a passive swatch row that has to be decoded and
 * then hand-entered into a separate dropdown.
 *
 * COLOUR IS NOT THE ONLY CUE
 * Every chip carries its workspace name as visible text, and the active
 * chip is distinguished by fill + `aria-current`, not by hue alone.
 *
 * `buildHref(null)` must produce the "all workspaces" URL. The parent
 * owns the rest of the query string (month, assignee, status, show
 * flags) so switching workspace never silently drops the user's other
 * filters — that round-trip bug is why the legend takes a callback
 * instead of composing the URL itself.
 */
export function WorkspaceLegend({
  workspaces,
  activeWorkspaceId,
  buildHref,
  label,
  allLabel,
  className,
}: {
  workspaces: readonly { id: string; name: string; series: number }[];
  activeWorkspaceId: string | null;
  buildHref: (workspaceId: string | null) => string;
  label: string;
  allLabel: string;
  className?: string;
}) {
  if (workspaces.length === 0) return null;
  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <LegendChip
        href={buildHref(null)}
        active={activeWorkspaceId === null}
        dot={null}
        label={allLabel}
        testId="workspace-legend-all"
      />
      {workspaces.map((workspace) => (
        <LegendChip
          key={workspace.id}
          href={buildHref(workspace.id)}
          active={activeWorkspaceId === workspace.id}
          dot={workspaceSeriesVar(workspace.series)}
          label={workspace.name}
          testId={`workspace-legend-${workspace.id}`}
        />
      ))}
    </nav>
  );
}

function LegendChip({
  href,
  active,
  dot,
  label,
  testId,
}: {
  href: string;
  active: boolean;
  dot: string | null;
  label: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "true" : undefined}
      title={label}
      className={cn(
        "focus-visible:ring-focus-ring border-border text-label inline-flex min-h-8 max-w-[12rem] items-center gap-1.5 rounded-full border px-2.5 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active
          ? "border-primary bg-primary-subtle text-primary"
          : "bg-surface text-fg-secondary hover:border-primary/50 hover:bg-surface-subtle hover:text-fg-primary",
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          style={{ backgroundColor: dot }}
          className="inline-block size-2 shrink-0 rounded-full"
        />
      ) : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}
