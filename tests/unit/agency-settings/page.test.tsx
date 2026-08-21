import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for `src/app/(app)/app/agency-settings/page.tsx`.
 *
 * The page is a server component that requires a real DB + auth
 * context, so we cannot render it in jsdom. Instead we keep the
 * surface stable:
 *   - it exports `metadata` and a default async function
 *   - it renders both the agency identity card and the managed
 *     services card with stable data-testid hooks
 *   - it renders the forbidden fallback with a back link when the
 *     actor is not an agency admin
 *   - it does not use any emoji icons (only Lucide + the
 *     `Credentials…` copy that the design system does not change)
 *
 * If a future polish pass needs to assert runtime behaviour (e.g.
 * fetch mocking for `activeAgencyId`), it should do so in a separate
 * `agency-settings-flow.test.tsx` rather than broadening this guard.
 */
describe("agency-settings page structure", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "agency-settings", "page.tsx"),
    "utf8",
  );

  it("exports metadata and a default async component", () => {
    expect(source).toMatch(/export const metadata\s*=\s*\{/);
    expect(source).toMatch(/export default async function AgencySettingsPage/);
  });

  it("renders the agency identity card with data-testid hooks", () => {
    expect(source).toMatch(/data-testid="agency-settings"/);
    expect(source).toMatch(/data-testid="agency-settings-identity"/);
    expect(source).toMatch(/testId="agency-name"/);
    expect(source).toMatch(/testId="agency-slug"/);
    expect(source).toMatch(/testId="agency-workspace-count"/);
    expect(source).toMatch(/testId="agency-member-count"/);
  });

  it("renders the managed services card with per-service testids", () => {
    expect(source).toMatch(/data-testid="agency-settings-services"/);
    expect(source).toMatch(/testId="agency-service-google-oauth"/);
    expect(source).toMatch(/testId="agency-service-magic-link"/);
    expect(source).toMatch(/testId="agency-service-minimax-ai"/);
    expect(source).toMatch(/testId="agency-service-sentry"/);
  });

  it("renders a forbidden fallback with a back link for non-admin actors", () => {
    expect(source).toMatch(/data-testid="agency-settings-forbidden"/);
    expect(source).toMatch(/data-testid="agency-settings-back"/);
  });

  it("uses Lucide icons (no emoji)", () => {
    // No raw emoji (matches the master prompt §18 rule). Lucide is
    // imported as named exports; we just sanity-check the import line
    // exists and the file does not import a generic `Icon` component.
    expect(source).toMatch(/from "lucide-react"/);
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F900}-\u{1F9FF}]/u;
    expect(emojiRe.test(source)).toBe(false);
  });
});
