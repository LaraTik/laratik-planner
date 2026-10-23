export const ISOLATED_PLAYWRIGHT_PROJECTS = [
  "chromium",
  "firefox",
  "webkit",
  "mobile-chrome",
  "mobile-safari",
  "visual-chromium",
] as const;

const GIB = 1024 * 1024 * 1024;
const LARGE_HOST_MEMORY = 32 * GIB;
const LARGE_HOST_NODE_HEAP_MB = 8192;

export function isolatedE2eNodeOptions(input: {
  current?: string;
  ci: boolean;
  hostMemoryBytes: number;
  requestedHeapMb?: string;
}): string | undefined {
  const current = input.current?.trim();
  if (current && /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s)/.test(current)) {
    return current;
  }

  const requested = input.requestedHeapMb?.trim();
  if (requested && (!/^\d+$/.test(requested) || !Number.isSafeInteger(Number(requested)))) {
    throw new Error("LARATIK_E2E_MAX_OLD_SPACE_SIZE must be a positive integer in MiB.");
  }
  const requestedHeap = requested ? Number(requested) : undefined;
  const heapMb =
    requestedHeap ??
    (!input.ci && input.hostMemoryBytes >= LARGE_HOST_MEMORY ? LARGE_HOST_NODE_HEAP_MB : undefined);
  if (heapMb !== undefined && heapMb < 1024) {
    throw new Error("LARATIK_E2E_MAX_OLD_SPACE_SIZE must be at least 1024 MiB.");
  }
  if (heapMb === undefined) return current || undefined;

  return [current, `--max-old-space-size=${heapMb}`].filter(Boolean).join(" ");
}

/**
 * Run the full isolated suite in separate project processes so each project
 * gets a fresh Next dev server. A caller that selects a project already owns
 * the desired grouping and keeps one invocation.
 */
export function planPlaywrightInvocations(args: string[]): string[][] {
  const hasProjectFilter = args.some((arg) => arg === "--project" || arg.startsWith("--project="));
  if (hasProjectFilter) return [args];
  return ISOLATED_PLAYWRIGHT_PROJECTS.map((project) => [...args, `--project=${project}`]);
}
