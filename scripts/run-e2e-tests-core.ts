export const ISOLATED_PLAYWRIGHT_PROJECTS = [
  "chromium",
  "firefox",
  "webkit",
  "mobile-chrome",
  "mobile-safari",
  "visual-chromium",
] as const;

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
