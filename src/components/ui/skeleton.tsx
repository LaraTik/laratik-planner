import { cn } from "@/lib/utils";

/**
 * shadcn/ui Skeleton — used for LoadingSkeleton per the master prompt.
 * Use surface-subtle as the base (matches our token system).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface-subtle animate-pulse rounded-[var(--radius-control)]", className)}
      {...props}
    />
  );
}

export { Skeleton };
