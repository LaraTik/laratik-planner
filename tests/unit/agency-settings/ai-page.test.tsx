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
 *   - it keeps provider-key availability separate from the agency
 *     database master switch, so the switch remains editable even
 *     before a provider key is configured
 *   - it does not use any emoji icons (only Lucide)
 *
 * The provider-key check only controls the connection test. The
 * database-backed agency setting controls product availability.
 */
describe("agency-ai-settings page structure", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "agency-settings", "ai", "page.tsx"),
    "utf8",
  );

  it("exports metadata and a default async component", () => {
    // Either a static `export const metadata` or a `generateMetadata`
    // function counts — the page switches to the latter form when the
    // title needs to come from the active locale (UI_UX_REFINEMENT_2026-09-01).
    expect(source).toMatch(
      /(export const metadata\s*=\s*\{|export async function generateMetadata)/,
    );
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
    expect(source).toMatch(/providerKeyAvailable=\{providerKeyAvailable\}/);
  });

  it("renders a forbidden fallback with a back link for non-admin actors", () => {
    expect(source).toMatch(/data-testid="agency-ai-forbidden"/);
  });

  it("uses Lucide icons (no emoji)", () => {
    expect(source).toMatch(/from "lucide-react"/);
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F900}-\u{1F9FF}]/u;
    expect(emojiRe.test(source)).toBe(false);
  });

  it("computes provider-key availability without an environment feature flag", () => {
    // Regression target: the master switch + Test connection should
    // be enabled when EITHER an env key OR a managed secret is
    // configured, regardless of deployment environment flags. The
    // backend (`/api/ai/generate`, `testAiConnection`, `chat`)
    // already short-circuits on "no key at all" rather than on
    // environment feature switch, so the UI must match.
    //
    // We pin the assignment so any future refactor that re-introduces
    // old deployment gate trips this test loudly.
    expect(source).toMatch(
      /const\s+providerKeyAvailable\s*=\s*envHasKey\s*\|\|\s*hasManagedSecret\s*;/,
    );
    // And the comment must explain WHY the env kill-switch is no
    // longer in this expression, so a future reader does not
    // re-add it.
    expect(source).not.toContain("AI_FEATURE_ENABLED");
  });

  it("uses the database master switch for effective runtime", () => {
    // The "Provider environment" card is a display of env state, not
    // a gate on feature availability. The provider environment badge
    // only reports whether the fallback key exists.
    expect(source).toMatch(/const\s+effectiveLive\s*=\s*providerKeyAvailable/);
  });
});

describe("workspace-ai-settings page structure", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "w", "[slug]", "ai-settings", "page.tsx"),
    "utf8",
  );

  it("computes effectiveEnabled from the database switch and active key", () => {
    // Same regression target as the agency page: the workspace status
    // card must reflect what the runtime will actually do. Since
    // `/api/ai/generate` allows managed-secret requests through
    // regardless of deployment environment flags, the "Enabled/Disabled"
    // badge here must not gate on the env kill-switch.
    expect(source).toMatch(
      /const\s+effectiveEnabled\s*=\s*!!activeAiKey\s*&&\s*feature\?\.enabled\s*===\s*true\s*;/,
    );
    // The environment key is a provider fallback, not a feature flag.
    const match = source.match(/const\s+effectiveEnabled\s*=\s*([^;]+);/);
    expect(match?.[1] ?? "").not.toMatch(/AI_FEATURE_ENABLED/);
  });
});
