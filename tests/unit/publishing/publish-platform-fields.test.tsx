import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { saveMock, readyMock } = vi.hoisted(() => ({
  // A save returns the persisted payload, and the form writes it back
  // into its draft state verbatim. The stub therefore has to return a
  // complete payload (including the server-owned `approval`) or the
  // next render reads `undefined.finalCopyApproved`.
  saveMock: vi.fn(async (_input: { payload: string }) => ({
    ok: true as const,
    payload: JSON.parse(_input.payload),
  })),
  readyMock: vi.fn(async () => ({ ok: true as const, report: {} })),
}));

/** Reset call history and any queued overrides between tests. */
function resetSaveMock() {
  saveMock.mockClear();
}

vi.mock("@/app/(app)/app/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: readyMock,
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: saveMock,
  setFinalCopyApprovalAction: vi.fn(),
}));

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishPackageForm } from "@/app/(app)/app/w/[slug]/planning/[id]/publish/publish-package-form";
import type { ReadinessReport } from "@/lib/publishing/readiness";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const socialChannelId = "22222222-2222-4222-8222-222222222222";

function readinessFor(platform: string): ReadinessReport {
  return {
    contentItemId,
    revision: 1,
    blockers: 0,
    recommendations: 0,
    requiredTotal: 0,
    requiredCompleted: 0,
    canPublish: false,
    issues: [],
    channels: [
      {
        socialChannelId,
        platform,
        hasPayload: true,
        requiredTotal: 1,
        requiredCompleted: 1,
        blockerCount: 0,
        recommendationCount: 0,
        issues: [],
      },
    ],
  };
}

function renderForm({
  platform,
  canSavePackage = true,
}: {
  platform: string;
  canSavePackage?: boolean;
}) {
  return render(
    <LocaleProvider locale="en">
      <PublishPackageForm
        workspaceId="33333333-3333-4333-8333-333333333333"
        workspaceSlug="demo"
        workspaceTimezone="Europe/Berlin"
        contentItemId={contentItemId}
        itemFormat="short_form_video"
        contentLocale="en"
        deliveryVersions={[]}
        channels={[
          {
            id: "44444444-4444-4444-8444-444444444444",
            socialChannelId,
            platform,
            accountName: "Dr. Reem Reda",
            payload: null,
          },
        ]}
        readiness={readinessFor(platform)}
        canSavePackage={canSavePackage}
        canApproveFinalCopy={false}
        canConfirmReadiness={false}
      />
    </LocaleProvider>,
  );
}

describe("per-platform required fields", () => {
  it("renders the YouTube title input and blocks a save while it is empty", async () => {
    resetSaveMock();
    renderForm({ platform: "youtube" });

    const title = await screen.findByTestId("publish-platform-title");
    expect(title).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("publish-save-draft"));

    // Field-level message, not a generic save failure.
    await waitFor(() => {
      expect(screen.getByText("Add a video title.")).toBeInTheDocument();
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("submits a YouTube package once the title is filled", async () => {
    resetSaveMock();
    renderForm({ platform: "youtube" });

    const title = await screen.findByTestId("publish-platform-title");
    fireEvent.change(title, { target: { value: "Cold brew in 30 seconds" } });
    fireEvent.click(screen.getByTestId("publish-save-draft"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    const call = saveMock.mock.calls[0]![0] as { payload: string };
    expect(JSON.parse(call.payload)).toMatchObject({
      platform: "youtube",
      title: "Cold brew in 30 seconds",
    });
  });

  it("renders both Pinterest required fields", async () => {
    renderForm({ platform: "pinterest" });

    expect(await screen.findByTestId("publish-platform-pinTitle")).toBeInTheDocument();
    expect(screen.getByTestId("publish-platform-boardId")).toBeInTheDocument();
  });

  it("blocks a Pinterest save when only the pin title is filled", async () => {
    resetSaveMock();
    renderForm({ platform: "pinterest" });

    fireEvent.change(await screen.findByTestId("publish-platform-pinTitle"), {
      target: { value: "Autumn menu" },
    });
    fireEvent.click(screen.getByTestId("publish-save-draft"));

    await waitFor(() => {
      expect(screen.getByText("Choose a Pinterest board.")).toBeInTheDocument();
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("renders the TikTok audience select", async () => {
    renderForm({ platform: "tiktok" });
    expect(await screen.findByTestId("publish-platform-privacy")).toBeInTheDocument();
  });

  it("renders no platform settings section for a platform with no required extras", async () => {
    renderForm({ platform: "instagram" });
    await screen.findByTestId("publish-save-draft");
    expect(screen.queryByTestId("publish-platform-settings")).not.toBeInTheDocument();
  });

  it("renders the Instagram Reel rights confirmations", async () => {
    renderForm({ platform: "instagram_reel" });
    expect(await screen.findByTestId("publish-audio-rights-checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("publish-transcript-reviewed-checkbox")).toBeInTheDocument();
  });

  it("renders the TikTok music rights confirmation only for TikTok", async () => {
    renderForm({ platform: "tiktok" });
    expect(await screen.findByTestId("publish-music-rights-checkbox")).toBeInTheDocument();
  });
});

describe("platform rights confirmations", () => {
  it("round-trips the Instagram Reel audio and transcript confirmations into the saved payload", async () => {
    resetSaveMock();
    renderForm({ platform: "instagram_reel" });

    // These are false-defaulted booleans a readiness rule blocks on
    // (`missing_audio_rights`, `transcript_not_reviewed`). Rendering them
    // is not the contract — persisting them is: the draft is only ever
    // sent to the server as this JSON string, so a flag that is missing
    // here is a flag that is silently lost, and the blocker it clears
    // can never clear.
    fireEvent.click(screen.getByRole("checkbox", { name: "I hold the rights to the audio" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "I reviewed the transcript" }));
    fireEvent.click(screen.getByTestId("publish-save-draft"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    const call = saveMock.mock.calls[0]![0] as { payload: string };
    const sent = JSON.parse(call.payload) as {
      platform: string;
      audioRightsConfirmed: boolean;
      transcriptReviewed: boolean;
    };
    expect(sent).toMatchObject({
      platform: "instagram_reel",
      audioRightsConfirmed: true,
      transcriptReviewed: true,
    });
  });

  it("round-trips the TikTok music-rights confirmation into the saved payload", async () => {
    resetSaveMock();
    renderForm({ platform: "tiktok" });

    fireEvent.click(screen.getByRole("checkbox", { name: "I hold the rights to the music" }));
    fireEvent.click(screen.getByTestId("publish-save-draft"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    const call = saveMock.mock.calls[0]![0] as { payload: string };
    expect(JSON.parse(call.payload)).toMatchObject({
      platform: "tiktok",
      musicRightsConfirmed: true,
    });
  });

  it("sends an unconfirmed rights flag as false rather than dropping it", async () => {
    // The schema defaults these to `false`, so an operator who never
    // touches the box must still produce an explicit `false`. Omitting
    // the key would let the Zod default re-apply server-side and hide
    // that the confirmation was never made.
    resetSaveMock();
    renderForm({ platform: "tiktok" });

    fireEvent.click(screen.getByTestId("publish-save-draft"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    const call = saveMock.mock.calls[0]![0] as { payload: string };
    const sent = JSON.parse(call.payload) as Record<string, unknown>;
    expect(sent).toHaveProperty("musicRightsConfirmed", false);
  });
});

describe("write authority on the publish form", () => {
  it("renders a read-only summary with no editable controls when saving is not permitted", async () => {
    renderForm({ platform: "youtube", canSavePackage: false });

    await screen.findByTestId("publish-read-only-summary");
    expect(screen.getByTestId("publish-read-only-caption")).toBeInTheDocument();
    expect(screen.getByTestId("publish-read-only-title")).toBeInTheDocument();

    // Zero editable controls — not disabled ones that still accept input.
    expect(screen.queryByTestId("publish-caption")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-platform-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-alt-text")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-hashtags")).not.toBeInTheDocument();
  });

  it("disables the save actions when saving is not permitted", async () => {
    renderForm({ platform: "instagram", canSavePackage: false });
    const save = await screen.findByTestId("publish-save-draft");
    expect(save).toBeDisabled();
  });

  it("surfaces the read-only state as a distinct region", async () => {
    renderForm({ platform: "instagram", canSavePackage: false });
    await screen.findByTestId("publish-read-only-summary");
    expect(screen.getByTestId("publish-read-only-platform")).toHaveTextContent("Instagram");
    expect(screen.getByTestId("publish-read-only-disclosure-rightsConfirmed")).toBeInTheDocument();
  });
});
