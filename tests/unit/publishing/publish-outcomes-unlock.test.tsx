import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PlanningSection } from "@/components/planning/planning-section";
import { tFor } from "@/messages";

/**
 * D5 — publication history must never be hidden.
 *
 * `outcomesUnlocked` is a deliberate anti-regression rule in the
 * planning detail page. The outcomes section (the only place an
 * operator's recorded publications are visible) unlocks on setup
 * readiness **or** on any record of prior publication. Gating it on
 * `publishingSetupReady` alone let a newer readiness flag hide a legacy
 * item's publication history — the one thing an operator can never
 * recreate.
 *
 * The rule is load-bearing because `publishingSetupReady` is derived
 * from the activity-event log (`publish_readiness` / "Publish package
 * confirmed ready"). An item published before that gate existed has no
 * such event, so `publishingSetupReady` is `false` for exactly the
 * legacy items the fallbacks exist to protect.
 *
 * `page.tsx` is a 1,700-line Server Component that reads the database,
 * the session, and the policy layer, so it cannot be rendered in jsdom.
 * The rule's definition is therefore asserted against the page's own
 * source (the same approach `publish-page-no-paths.test.tsx` uses for
 * the other server-rendered publishing contract), and the *effect* it
 * drives — `defaultOpen` on the collapsible outcomes section — is
 * asserted behaviourally below.
 */

const PAGE_SOURCE = readFileSync(
  resolve(process.cwd(), "src/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/page.tsx"),
  "utf8",
);

/** The `const outcomesUnlocked = …;` initializer, up to its terminator. */
function outcomesUnlockedExpression(): string {
  const start = PAGE_SOURCE.indexOf("const outcomesUnlocked =");
  expect(start, "page.tsx no longer declares outcomesUnlocked").toBeGreaterThan(-1);
  const end = PAGE_SOURCE.indexOf("\n  const", start);
  expect(end, "could not delimit the outcomesUnlocked initializer").toBeGreaterThan(start);
  return PAGE_SOURCE.slice(start, end);
}

describe("outcomesUnlocked — publication history is never hidden", () => {
  it("unlocks on setup readiness", () => {
    expect(outcomesUnlockedExpression()).toMatch(/publishingSetupReady/);
  });

  it("unlocks on any recorded publication, even with no setup-ready event", () => {
    // `publicationByChannel` is keyed on a `publication_record` row per
    // channel. A partially-recorded item must still see the ones it has.
    expect(outcomesUnlockedExpression()).toMatch(/publicationByChannel\.size\s*>\s*0/);
  });

  it("unlocks on the two historical item statuses", () => {
    const expression = outcomesUnlockedExpression();
    expect(expression).toMatch(/item\.status\s*===\s*"partially_published"/);
    expect(expression).toMatch(/item\.status\s*===\s*"published"/);
  });

  it("is a disjunction, so no single trigger can be dropped by accident", () => {
    // A regression to `publishingSetupReady && …` or a rename of one
    // term would leave the individual `toMatch` assertions above passing
    // while silently re-hiding legacy history.
    const expression = outcomesUnlockedExpression();
    expect(expression).toMatch(
      /publishingSetupReady\s*\|\|\s*publicationByChannel\.size\s*>\s*0\s*\|\|\s*item\.status\s*===\s*"partially_published"\s*\|\|\s*item\.status\s*===\s*"published"/,
    );
  });

  it("drives both the outcomes section's open state and its description", () => {
    // Opening the section is only half the rule — a legacy item also has
    // to be told what the section is for, not that it is "available once
    // publishing setup is complete".
    expect(PAGE_SOURCE).toMatch(/defaultOpen=\{outcomesUnlocked\}/);
    expect(PAGE_SOURCE).toMatch(
      /outcomesUnlocked\s*\?\s*t\("contentDetail\.publishWorkspace\.outcomesDescription"\)\s*:\s*t\("contentDetail\.publishWorkspace\.outcomesLockedDescription"\)/,
    );
  });

  it("keeps the locked-state copy in both catalogs, so the locked branch is not a raw key", () => {
    for (const locale of ["en", "ar"] as const) {
      const catalog = tFor(locale);
      expect(catalog("contentDetail.publishWorkspace.outcomesLockedDescription")).not.toBe(
        "contentDetail.publishWorkspace.outcomesLockedDescription",
      );
    }
  });
});

describe("the outcomes disclosure honours defaultOpen (PlanningSection)", () => {
  const t = tFor("en");

  it("starts expanded when the server says the section is unlocked", () => {
    render(
      <PlanningSection
        id="publish-outcomes"
        title={t("contentDetail.publishNavigator.outcomes")}
        description={t("contentDetail.publishWorkspace.outcomesDescription")}
        collapsible
        defaultOpen
      >
        <p>Publication history</p>
      </PlanningSection>,
    );

    const section = document.getElementById("publish-outcomes");
    expect(section).not.toBeNull();
    expect((section as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText("Publication history")).toBeInTheDocument();
  });

  it("starts collapsed when the server says the section is locked", () => {
    render(
      <PlanningSection
        id="publish-outcomes"
        title={t("contentDetail.publishNavigator.outcomes")}
        description={t("contentDetail.publishWorkspace.outcomesLockedDescription")}
        collapsible
        defaultOpen={false}
      >
        <p>Publication history</p>
      </PlanningSection>,
    );

    const section = document.getElementById("publish-outcomes");
    expect(section).not.toBeNull();
    expect((section as HTMLDetailsElement).open).toBe(false);
    // The history is still rendered — a locked section is a collapsed
    // disclosure, never a removed one. Hiding it entirely is the exact
    // failure this rule was written to prevent.
    expect(screen.getByText("Publication history")).toBeInTheDocument();
    expect(
      screen.getByText(t("contentDetail.publishWorkspace.outcomesLockedDescription")),
    ).toBeInTheDocument();
  });
});
