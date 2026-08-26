import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiDiagnosticPanel } from "@/components/ai/ai-diagnostic-panel";

/**
 * Regression guard for the 2026-08-27 AI diagnostic panel.
 *
 * The user's report was "AI is enabled but still not". The root
 * cause was that the admin toggle in the database reads "On" while
 * three separate runtime prerequisites (env kill-switch, env key,
 * managed secret) are unmet. The fix is this panel, which makes
 * the state of every prerequisite explicit. This test pins the
 * "every prerequisite is shown, with the right state" contract so
 * a future tweak can't accidentally hide one of them.
 */

describe("AiDiagnosticPanel", () => {
  it("marks every prereq as 'missing/off' and shows a fix when all are unmet", () => {
    const html = renderToStaticMarkup(
      <AiDiagnosticPanel
        envKillSwitch={false}
        envHasKey={false}
        hasManagedSecret={false}
        managedSecretSuffix={null}
        masterSwitch
        anyCapabilityOn
        effectiveLive={false}
        aiEntryHref="/app"
      />,
    );
    // Three prerequisite items, all in the warning state.
    expect(html).toContain("ai-prereq-kill-switch");
    expect(html).toContain("ai-prereq-env-key");
    expect(html).toContain("ai-prereq-managed-secret");
    // "Effective runtime: Blocked" + a "blocked" banner.
    expect(html).toContain("Blocked");
    expect(html).toContain("ai-diagnostic-blocked-banner");
    // The "where AI lives" section points at the content pages.
    expect(html).toContain("ai-diagnostic-where-link");
    expect(html).toContain("/app");
  });

  it("flips to 'AI is live' when the prerequisites + toggle + capabilities are all set", () => {
    const html = renderToStaticMarkup(
      <AiDiagnosticPanel
        envKillSwitch
        envHasKey
        hasManagedSecret={false}
        managedSecretSuffix={null}
        masterSwitch
        anyCapabilityOn
        effectiveLive
        aiEntryHref="/app"
      />,
    );
    expect(html).toContain("AI is live");
    expect(html).toContain("Live");
    // No blocked banner on the happy path.
    expect(html).not.toContain("ai-diagnostic-blocked-banner");
  });

  it("uses the managed secret suffix in the detail line when one exists", () => {
    const html = renderToStaticMarkup(
      <AiDiagnosticPanel
        envKillSwitch={false}
        envHasKey={false}
        hasManagedSecret
        managedSecretSuffix="ab12"
        masterSwitch={false}
        anyCapabilityOn={false}
        effectiveLive={false}
        aiEntryHref="/app"
      />,
    );
    // The detail line for the managed-secret prereq shows the
    // masked suffix when the secret is present.
    expect(html).toContain("ends in");
    expect(html).toContain("ab12");
  });

  it("hides the fix line on a prereq that is already satisfied", () => {
    const html = renderToStaticMarkup(
      <AiDiagnosticPanel
        envKillSwitch
        envHasKey
        hasManagedSecret={false}
        managedSecretSuffix={null}
        masterSwitch={false}
        anyCapabilityOn={false}
        effectiveLive={false}
        aiEntryHref="/app"
      />,
    );
    // kill-switch and env-key are OK — their fix lines should not
    // be rendered. The managed-secret prereq is still missing, so
    // its fix line IS rendered.
    expect(html).not.toContain("ai-prereq-kill-switch-fix");
    expect(html).not.toContain("ai-prereq-env-key-fix");
    expect(html).toContain("ai-prereq-managed-secret-fix");
  });
});
