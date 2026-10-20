import type { FullConfig } from "@playwright/test";

/**
 * Warm the Auth.js route before browser tests begin. On a cold Next dev
 * server, `/api/health/ready` can pass while the first `/api/auth/session`
 * request still sees an empty App Router manifest. That one transient 500
 * can leave a browser on the shell's loading boundary for the rest of a test.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required to warm the Auth.js route.");
  }

  const deadline = Date.now() + 120_000;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const response = await fetch(new URL("/api/auth/session", baseURL), {
        headers: { "x-playwright-test": "laratik-planner-e2e" },
      });
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        await response.arrayBuffer();
        if (attempts > 1) {
          console.info(`[e2e] Auth.js session route became ready after ${attempts} attempts.`);
        }
        return;
      }
    } catch {
      // The route may still be compiling or the dev server may be restarting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Auth.js session route did not become ready within 120 seconds.");
}
