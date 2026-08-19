import { spawnSync } from "node:child_process";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "TEST_DATABASE_URL is required and must point to a disposable PostgreSQL database.",
  );
  process.exit(1);
}
if (!/(test|ci)/i.test(databaseUrl)) {
  console.error(
    "Refusing to run destructive integration tests against a URL without 'test' or 'ci'.",
  );
  process.exit(1);
}

const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" };
const requestedTests = process.argv.slice(2).filter((arg) => arg !== "--");
for (const [command, args] of [
  ["pnpm", ["db:migrate"]],
  [
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.integration.config.ts", ...requestedTests],
  ],
] as const) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
