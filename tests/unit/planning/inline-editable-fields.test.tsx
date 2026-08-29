/**
 * Regression test for the server-component / client-component
 * boundary bug on the planning detail page.
 *
 * Symptom (2026-08-29, production on planner.laratik.com):
 * visiting /app/w/food-game/planning/<id> threw
 *
 *   Functions cannot be passed directly to Client Components
 *   unless you explicitly expose it by marking it with "use
 *   server". Or maybe you meant to call this function rather
 *   than return it.
 *
 * and bubbled to the parent error boundary as
 * "We hit an error rendering Planning".
 *
 * Root cause: the page.tsx server component instantiated
 * `<InlineEditableField>` (a `"use client"` component) with
 * inline `render` / `renderEditor` / `onSave` arrow functions.
 * In Next.js 16, only plain values, plain objects, and
 * Server-Action functions can cross the server→client boundary.
 * The inline arrows are plain functions, so the runtime rejects
 * them.
 *
 * The fix: extract the three inline-field usages into a
 * `"use client"` file (`./inline-editable-fields.tsx`) that
 * takes only serialisable props. The arrow functions live
 * entirely inside the client module, so they never cross a
 * boundary.
 *
 * What this test pins down
 * ------------------------
 * 1. The wrapper file exists and exports the three wrappers
 *    used by `page.tsx`.
 * 2. The wrapper file declares `"use client"` at the top.
 *    A future refactor that drops the directive (and re-
 *    introduces the same bug) fails this test.
 * 3. Each wrapper is a React component that, when rendered
 *    in view mode, shows the supplied value and surfaces a
 *    working pencil button.
 * 4. Each wrapper's save path calls the matching server
 *    action with the right (slug, id, value) arguments.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Mock the server-action module so the wrappers can be rendered
// in a single client context without hitting the server.
// (Server actions are imported as references; in unit tests we
// just need them to be callable.)
vi.mock("@/lib/content/inline-update", () => ({
  inlineUpdateBriefAction: vi.fn(async () => ({ ok: true as const })),
  inlineUpdateTitleAction: vi.fn(async () => ({ ok: true as const })),
  inlineUpdateDateAction: vi.fn(async () => ({ ok: true as const })),
}));

import {
  InlineBriefEditor,
  InlineDateEditor,
  InlineTitleEditor,
} from "@/app/(app)/app/w/[slug]/planning/[id]/inline-editable-fields";
import {
  inlineUpdateBriefAction,
  inlineUpdateDateAction,
  inlineUpdateTitleAction,
} from "@/lib/content/inline-update";

const WRAPPER_PATH = resolve(
  process.cwd(),
  "src/app/(app)/app/w/[slug]/planning/[id]/inline-editable-fields.tsx",
);

describe("inline-editable-fields wrappers (planning detail)", () => {
  describe("file-level guard rails", () => {
    it('starts with the "use client" directive', () => {
      // The whole point of the wrapper file is to host the
      // function-prop usage on the client side. If a future
      // refactor accidentally drops the directive, the bug
      // returns and the page goes back to the
      // "We hit an error rendering Planning" state. Pin it.
      const source = readFileSync(WRAPPER_PATH, "utf8");
      // Trim a leading BOM / shebang if any, then check the
      // first non-empty line.
      const firstNonEmpty = source
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      expect(firstNonEmpty).toBe('"use client";');
    });

    it("exports the three wrappers page.tsx relies on", () => {
      expect(typeof InlineBriefEditor).toBe("function");
      expect(typeof InlineTitleEditor).toBe("function");
      expect(typeof InlineDateEditor).toBe("function");
    });
  });

  describe("InlineBriefEditor", () => {
    it("renders the brief in view mode by default", () => {
      render(
        <InlineBriefEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value="Ship a 9 AM kickoff post."
        />,
      );
      expect(screen.getByText("Ship a 9 AM kickoff post.")).toBeInTheDocument();
    });

    it("falls back to the muted placeholder when value is empty", () => {
      render(
        <InlineBriefEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value=""
        />,
      );
      expect(screen.getByText("No brief yet.")).toBeInTheDocument();
    });

    it("calls inlineUpdateBriefAction with (slug, id, next) on save", async () => {
      render(
        <InlineBriefEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value="Old brief"
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /Edit brief/i }));
      const textarea = screen.getByDisplayValue("Old brief");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "New brief");
      await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      expect(inlineUpdateBriefAction).toHaveBeenCalledWith(
        "food-game",
        "260aa351-a049-4a1a-9437-546a1ad28e3d",
        "New brief",
      );
    });
  });

  describe("InlineTitleEditor", () => {
    it("renders the title in view mode by default", () => {
      render(
        <InlineTitleEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value="August Kickoff"
        />,
      );
      expect(screen.getByText("August Kickoff")).toBeInTheDocument();
    });

    it("calls inlineUpdateTitleAction with (slug, id, next) on save", async () => {
      render(
        <InlineTitleEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value="Old title"
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /Edit title/i }));
      const input = screen.getByDisplayValue("Old title");
      await userEvent.clear(input);
      await userEvent.type(input, "New title");
      await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      expect(inlineUpdateTitleAction).toHaveBeenCalledWith(
        "food-game",
        "260aa351-a049-4a1a-9437-546a1ad28e3d",
        "New title",
      );
    });
  });

  describe("InlineDateEditor", () => {
    const ISO = "2026-08-29T09:00:00.000Z";
    const TZ = "Europe/Berlin";

    it("renders the formatted date and timezone in view mode", () => {
      render(
        <InlineDateEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value={ISO}
          timezone={TZ}
        />,
      );
      // toLocaleString output is locale-dependent; assert the
      // timezone label is present and the wrapper rendered
      // something time-shaped next to it.
      expect(screen.getByText(new RegExp(TZ))).toBeInTheDocument();
    });

    it("calls inlineUpdateDateAction with a Date on save", async () => {
      render(
        <InlineDateEditor
          workspaceSlug="food-game"
          contentItemId="260aa351-a049-4a1a-9437-546a1ad28e3d"
          value={ISO}
          timezone={TZ}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /Edit planned publish date/i }));
      // The datetime-local input is pre-populated with the
      // formatted value. We just fire save with the original
      // value to assert the wrapper turns the ISO string into
      // a Date and forwards (slug, id, Date) to the action.
      await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      expect(inlineUpdateDateAction).toHaveBeenCalledWith(
        "food-game",
        "260aa351-a049-4a1a-9437-546a1ad28e3d",
        expect.any(Date),
      );
    });
  });
});
