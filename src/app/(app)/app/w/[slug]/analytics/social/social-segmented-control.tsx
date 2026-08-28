/**
 * M5 — segmented control for URL-driven selectors.
 *
 * The page has two URL-driven selectors (window + metric). Both
 * render the same shape: a rounded container with internal options,
 * the active one highlighted. This component centralises the
 * visual contract so the two selectors read as the same control.
 *
 * The control is a Server Component (anchor tags, not buttons). The
 * active state is conveyed by `aria-current="page"` AND a fill —
 * both are needed because `aria-current` alone is invisible to
 * sighted users.
 */
export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  href: string;
  testId: string;
}

export function SegmentedControl<T extends string | number>({
  label,
  options,
  current,
}: {
  /** Human-readable label announced to screen readers (e.g. "Window selector"). */
  label: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  current: T;
}) {
  return (
    <nav
      aria-label={label}
      className="border-border bg-surface-subtle inline-flex items-center gap-0.5 rounded-md border p-0.5"
    >
      {options.map((opt) => {
        const isActive = opt.value === current;
        return (
          <a
            key={String(opt.value)}
            href={opt.href}
            aria-current={isActive ? "page" : undefined}
            data-testid={opt.testId}
            className={`text-body rounded-sm px-3 py-1 transition-colors ${
              isActive
                ? "bg-surface text-fg-primary shadow-sm"
                : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {opt.label}
          </a>
        );
      })}
    </nav>
  );
}
