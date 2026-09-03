import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/components/i18n/locale-provider";

/**
 * UI contract for the destructive "Reset idea" confirm dialog.
 *
 * The dialog is the ONLY user-facing surface for the kill switch,
 * so the form wiring matters. These tests pin:
 *
 *   1. Every bucket from `RESET_IDEA_BUCKETS` renders with its label
 *      and the live count. An operator who sees a 0 must not be
 *      told there's something to delete.
 *   2. The typed-phrase input must equal the idea title EXACTLY for
 *      the submit button to enable. Case-sensitive, whitespace-
 *      sensitive.
 *   3. The reason textarea must be at least 8 trimmed characters.
 *   4. The submit button stays disabled while either constraint is
 *      unsatisfied; this is the strongest "you can't fat-finger
 *      this" guard we ship.
 *
 * Server action wiring is exercised by the dedicated
 * `tests/unit/reset-idea-action.test.ts` suite; this file only
 * covers the form.
 */

vi.mock("@/lib/content/reset-idea-action", () => ({
  resetIdeaAction: vi.fn(),
}));

import { DestructiveConfirmDialog } from "@/components/forms/destructive-confirm-dialog";
import {
  EMPTY_RESET_IDEA_COUNTS,
  RESET_IDEA_BUCKETS,
  type ResetIdeaCounts,
} from "@/lib/content/reset-idea";

const SAMPLE_IDEA_TITLE = "Spring sale — Instagram carousel";

function countsWith(partial: Partial<ResetIdeaCounts> = {}): ResetIdeaCounts {
  return { ...EMPTY_RESET_IDEA_COUNTS, ...partial };
}

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof DestructiveConfirmDialog>> = {},
) {
  return render(
    <DestructiveConfirmDialog
      open
      onOpenChange={vi.fn()}
      workspaceSlug="acme"
      contentItemId="00000000-0000-0000-0000-000000000010"
      ideaTitle={SAMPLE_IDEA_TITLE}
      counts={countsWith({
        contentItem: 1,
        contentItemChannels: 3,
        comments: 12,
        deliveryVersions: 2,
        attachments: 4,
      })}
      {...overrides}
    />,
  );
}

describe("DestructiveConfirmDialog", () => {
  beforeEach(() => {
    // `useActionState` is happy with a stub action; this test never submits.
  });

  it("renders every bucket with its label and the live count", () => {
    renderDialog();
    for (const bucket of RESET_IDEA_BUCKETS) {
      // The label and the rendered number both appear in the dialog body.
      const bucketNode = screen.getByTestId(`destructive-bucket-${bucket.key}`);
      expect(bucketNode.textContent).toContain(bucket.label);
    }
    // The non-zero counts from our fixture show up numerically.
    expect(screen.getByTestId("destructive-bucket-contentItem").textContent).toMatch(/1/);
    expect(screen.getByTestId("destructive-bucket-contentItemChannels").textContent).toMatch(/3/);
    expect(screen.getByTestId("destructive-bucket-comments").textContent).toMatch(/12/);
  });

  it("keeps the submit button disabled until the typed phrase matches exactly", async () => {
    const user = userEvent.setup();
    renderDialog();
    const submit = screen.getByTestId("destructive-submit");
    expect(submit).toBeDisabled();
    const phrase = screen.getByTestId("destructive-typed-phrase");
    const reason = screen.getByTestId("destructive-reason");
    // Fill the reason first — submit stays disabled until BOTH constraints pass.
    await user.type(reason, "Reset for the next planning cycle test run.");
    // Wrong phrase (case-insensitive close, but exact match required).
    await user.type(phrase, "spring sale — instagram carousel");
    expect(submit).toBeDisabled();
    // Clear and re-type the correct phrase.
    await user.clear(phrase);
    await user.type(phrase, SAMPLE_IDEA_TITLE);
    expect(submit).not.toBeDisabled();
  });

  it("keeps the submit button disabled when the reason is shorter than 8 characters", async () => {
    const user = userEvent.setup();
    renderDialog();
    const submit = screen.getByTestId("destructive-submit");
    const phrase = screen.getByTestId("destructive-typed-phrase");
    const reason = screen.getByTestId("destructive-reason");
    await user.type(phrase, SAMPLE_IDEA_TITLE);
    await user.type(reason, "too");
    expect(submit).toBeDisabled();
    await user.type(reason, " short to fit");
    expect(submit).not.toBeDisabled();
  });

  it("shows the live idea title next to the typed-phrase input as a hint", () => {
    renderDialog();
    // The hint is the <p> immediately under the typed-phrase label,
    // distinguished by id `destructive-typed-phrase-help` so it can
    // be reached directly without depending on the label.
    const phraseHelp = document.getElementById("destructive-typed-phrase-help");
    expect(phraseHelp).not.toBeNull();
    expect(phraseHelp?.textContent).toContain(SAMPLE_IDEA_TITLE);
  });

  it("renders the destructive safety copy from the Arabic catalog", () => {
    render(
      <LocaleProvider locale="ar">
        <DestructiveConfirmDialog
          open
          onOpenChange={vi.fn()}
          workspaceSlug="acme"
          contentItemId="00000000-0000-0000-0000-000000000010"
          ideaTitle={SAMPLE_IDEA_TITLE}
          counts={countsWith({ contentItem: 1 })}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("إعادة تعيين هذه الفكرة");
    expect(screen.getByText("ما سيتم حذفه")).toBeInTheDocument();
    expect(screen.getByLabelText("اكتب عنوان الفكرة للتأكيد")).toBeInTheDocument();
    expect(screen.getByLabelText("السبب")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة تعيين الفكرة" })).toBeInTheDocument();
  });
});
