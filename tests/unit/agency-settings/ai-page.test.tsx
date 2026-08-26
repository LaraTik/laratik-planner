import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for `src/app/(app)/app/agency-settings/ai/page.tsx`.
 *
 * The page is a server component that requires a real DB + auth
 * context, so we cannot render it in jsdom. Instead we keep the
 * surface stable:
 *   - it exports `metadata` and a default async function
 *   - it renders both the "Provider key" card and the "Feature
 *     settings" card with stable data-testid hooks
 *   - it computes `featureIsEnabled` so that a managed secret alone
 *     enables the master switch, matching the backend
 *     (`/api/ai/generate`, `testAiConnection`, `chat` all bypass
 *     `AI_FEATURE_ENABLED` when a managed secret exists)
 *   - it does not use any emoji icons (only Lucide)
 *
 * The `featureIsEnabled` check is the regression target — the
 * previous fix (commit 0e7732d) still required `AI_FEATURE_ENABLED`
 * to be true, which left the master switch disabled on deployments
 * where the operator had not flipped the env kill-switch but an
 * agency had configured a managed secret.
 */
describe("agency-ai-settings page structure", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "agency-settings", "ai", "page.tsx"),
    "utf8",
  );

  it("exports metadata and a default async component", () => {
    expect(source).toMatch(/export const metadata\s*=\s*\{/);
    expect(source).toMatch(/export default async function AgencyAiSettingsPage/);
  });

  it("renders the agency AI settings surface with stable data-testid hooks", () => {
    expect(source).toMatch(/data-testid="agency-ai-settings"/);
    // The form-level testids live in `ai-settings-form.tsx` and
    // `managed-secret-form.tsx`; here we only assert the page-level
    // surface plus the explicit references the page passes to the
    // child components.
    expect(source).toMatch(/ManagedSecretForm/);
    expect(source).toMatch(/AiSettingsForm/);
    expect(source).toMatch(/featureIsEnabled=\{featureIsEnabled\}/);
  });

  it("renders a forbidden fallback with a back link for non-admin actors", () => {
    expect(source).toMatch(/data-testid="agency-ai-forbidden"/);
  });

  it("uses Lucide icons (no emoji)", () => {
    expect(source).toMatch(/from "lucide-react"/);
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F900}-\u{1F9FF}]/u;
    expect(emojiRe.test(source)).toBe(false);
  });

  it("computes featureIsEnabled so a managed secret bypasses AI_FEATURE_ENABLED", () => {
    // Regression target: the master switch + Test connection should
    // be enabled when EITHER an env key OR a managed secret is
    // configured, regardless of `serverEnv.AI_FEATURE_ENABLED`. The
    // backend (`/api/ai/generate`, `testAiConnection`, `chat`)
    // already short-circuits on "no key at all" rather than on
    // `AI_FEATURE_ENABLED` alone, so the UI must match.
    //
    // We pin the assignment so any future refactor that re-introduces
    // the `AI_FEATURE_ENABLED` gate (the bug fixed by 0e7732d + the
    // follow-up) trips this test loudly.
    expect(source).toMatch(
      /const\s+featureIsEnabled\s*=\s*envHasKey\s*\|\|\s*hasManagedSecret\s*;/,
    );
    // And the comment must explain WHY the env kill-switch is no
    // longer in this expression, so a future reader does not
    // re-add it.
    expect(source).toMatch(/backend already allows a managed secret to bypass/);
  });

  it("keeps envEnabled as an env-only display badge", () => {
    // The "Provider environment" card is a display of env state, not
    // a gate on feature availability. `envEnabled` must still include
    // the `AI_FEATURE_ENABLED` check so the badge correctly reads
    // "Not configured" when the env is off.
    expect(source).toMatch(
      /const\s+envEnabled\s*=\s*serverEnv\.AI_FEATURE_ENABLED\s*&&\s*!!serverEnv\.MINIMAX_API_KEY\s*;/,
    );
  });
});

describe("workspace-ai-settings page structure", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "w", "[slug]", "ai-settings", "page.tsx"),
    "utf8",
  );

  it("computes effectiveEnabled so a managed secret bypasses AI_FEATURE_ENABLED", () => {
    // Same regression target as the agency page: the workspace status
    // card must reflect what the runtime will actually do. Since
    // `/api/ai/generate` allows managed-secret requests through
    // regardless of `AI_FEATURE_ENABLED`, the "Enabled/Disabled"
    // badge here must not gate on the env kill-switch.
    expect(source).toMatch(
      /const\s+effectiveEnabled\s*=\s*hasAnyKey\s*&&\s*\(\s*feature\?\.enabled\s*\?\?\s*true\s*\)\s*;/,
    );
    // No reference to AI_FEATURE_ENABLED in the same expression
    // (it's a display of env state, not a feature gate).
    const match = source.match(/const\s+effectiveEnabled\s*=\s*([^;]+);/);
    expect(match?.[1] ?? "").not.toMatch(/AI_FEATURE_ENABLED/);
  });
});
