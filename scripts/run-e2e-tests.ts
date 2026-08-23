import { spawnSync } from "node:child_process";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "TEST_DATABASE_URL is required and must point to a disposable PostgreSQL database.",
  );
  process.exit(1);
}
if (!/(test|ci)/i.test(databaseUrl)) {
  console.error("Refusing to run destructive browser tests against a URL without 'test' or 'ci'.");
  process.exit(1);
}

const requestedTests = process.argv.slice(2).filter((arg) => arg !== "--");
const testArgs = requestedTests.some((arg) => arg.startsWith("--workers"))
  ? requestedTests
  : [...requestedTests, "--workers=1"];
const port = process.env.PORT ?? "3011";
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  PORT: port,
  PLAYWRIGHT_BASE_URL: baseUrl,
  AUTH_URL: baseUrl,
  NEXTAUTH_URL: baseUrl,
  AUTH_TRUST_HOST: "true",
};

for (const [command, args] of [
  ["pnpm", ["db:migrate"]],
  ["pnpm", ["exec", "playwright", "test", ...testArgs]],
] as const) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
