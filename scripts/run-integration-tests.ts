import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

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

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "integration-test-only-auth-secret-32-bytes",
  AGENCY_COOKIE_SECRET:
    process.env.AGENCY_COOKIE_SECRET ?? "integration-test-only-agency-cookie-secret-32-bytes",
};

const integrationRoot = path.resolve("tests/integration");
const testFilePattern = /\.(test|spec)\.[cm]?[jt]sx?$/;

async function collectTestFiles(target: string): Promise<string[]> {
  const absolute = path.resolve(target);
  const metadata = await stat(absolute).catch(() => null);
  if (!metadata) {
    throw new Error(`Integration test target does not exist: ${target}`);
  }
  if (metadata.isFile()) {
    if (!testFilePattern.test(absolute) || !absolute.startsWith(`${integrationRoot}${path.sep}`)) {
      throw new Error(`Integration test target must be under tests/integration: ${target}`);
    }
    return [path.relative(process.cwd(), absolute)];
  }

  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      collectTestFiles(path.join(absolute, entry.name)).catch((error) => {
        if (entry.isDirectory()) throw error;
        return [];
      }),
    ),
  );
  return nested.flat().sort();
}

async function main() {
  const requestedTests = process.argv.slice(2).filter((arg) => arg !== "--");
  if (requestedTests.some((arg) => arg.startsWith("-"))) {
    throw new Error(
      "The integration runner accepts test files or directories only; pass Vitest options through pnpm exec vitest with one file at a time.",
    );
  }

  const testFiles = requestedTests.length
    ? (await Promise.all(requestedTests.map(collectTestFiles))).flat().sort()
    : await collectTestFiles(integrationRoot);
  const uniqueTestFiles = [...new Set(testFiles)];
  if (uniqueTestFiles.length === 0) {
    throw new Error("No integration test files matched the requested target.");
  }

  const migrateResult = spawnSync("pnpm", ["db:migrate"], { env, stdio: "inherit" });
  if (migrateResult.status !== 0) process.exit(migrateResult.status ?? 1);

  // Vitest 2 can schedule files concurrently inside one worker even when
  // fileParallelism is disabled. These suites intentionally share one
  // disposable database, so launch one Vitest process per file. This keeps
  // the existing multi-file command compatible while making cleanup and
  // fixture ownership deterministic.
  for (const testFile of uniqueTestFiles) {
    console.log(`\n▶ integration: ${testFile}`);
    const result = spawnSync(
      "pnpm",
      ["exec", "vitest", "run", "--config", "vitest.integration.config.ts", testFile],
      { env, stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
