import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformPreviewSwitcher } from "@/components/planning/platform-preview-switcher";
import { LocaleProvider } from "@/components/i18n/locale-provider";

/**
 * The preview is reused across channels: `PlatformPreviewSwitcher`
 * resolves the active channel and hands it to a single `PlatformPreview`
 * instance. Because that instance is mounted without a `key`, React
 * reconciles it in place and its internal `format` / `dimension` /
 * `compareAll` state SURVIVES a channel switch.
 *
 * `formatOptionsFor` is platform-dependent: Instagram offers
 * feed/reel/story, TikTok offers reel/post, and a Pinterest channel
 * offers only "post". So a `format` chosen on one channel can be
 * meaningless on the next — Instagram "story" carried onto Pinterest
 * rendered story chrome (no action row, story safe-area overlay) on a
 * channel that has no story format and no toggle to escape it.
 *
 * The invariant: whatever the previous channel left selected, the preview
 * must render a format the CURRENT platform actually supports.
 */

const ig = {
  id: "ch-instagram",
  socialChannelId: "sc-instagram",
  platform: "instagram",
  accountName: "Acme",
};
const pinterest = {
  id: "ch-pinterest",
  socialChannelId: "sc-pinterest",
  platform: "pinterest",
  accountName: "Acme Pin",
};

function renderSwitcher() {
  return render(
    <LocaleProvider locale="en">
      <PlatformPreviewSwitcher
        channels={[ig, pinterest]}
        sharedCaption="Shared copy."
        thumbnailUrl="https://x.com/hero.png"
        thumbnailWidth={1080}
        thumbnailHeight={1350}
      />
    </LocaleProvider>,
  );
}

describe("PlatformPreviewSwitcher — format state across channels", () => {
  it("never carries a format onto a channel that does not offer it", () => {
    renderSwitcher();

    // Pick Story on Instagram.
    fireEvent.click(screen.getByTestId("platform-preview-format-story"));
    expect(screen.getByTestId("platform-preview")).toHaveAttribute("data-format", "story");

    // Switch to a Pinterest channel, whose only format is "post".
    fireEvent.click(screen.getByTestId("platform-preview-channel-sc-pinterest"));

    const preview = screen.getByTestId("platform-preview");
    expect(preview).toHaveAttribute("data-platform", "pinterest");
    // The leaked value would render story chrome here.
    expect(preview).toHaveAttribute("data-format", "post");
    // Story chrome means the action row is hidden and the story
    // safe-area overlay is mounted. A "post" channel gets neither.
    expect(screen.queryByTestId("safe-area-toggle")).not.toBeInTheDocument();
  });

  it("keeps a format the next channel DOES offer", () => {
    render(
      <LocaleProvider locale="en">
        <PlatformPreviewSwitcher
          channels={[ig, { ...pinterest, platform: "tiktok", accountName: "Acme TT" }]}
          sharedCaption="Shared copy."
          thumbnailUrl="https://x.com/hero.png"
          thumbnailWidth={1080}
          thumbnailHeight={1350}
        />
      </LocaleProvider>,
    );

    // "feed" is not a TikTok format, but "reel" is.
    fireEvent.click(screen.getByTestId("platform-preview-format-reel"));
    expect(screen.getByTestId("platform-preview")).toHaveAttribute("data-format", "reel");

    fireEvent.click(screen.getByTestId("platform-preview-channel-sc-pinterest"));
    // Reel is valid on TikTok — it must be preserved, not reset.
    expect(screen.getByTestId("platform-preview")).toHaveAttribute("data-format", "reel");
  });

  it("clears the compare-all grid when the channel changes", () => {
    renderSwitcher();

    fireEvent.click(screen.getByTestId("platform-preview-dimension-all"));
    expect(screen.getByTestId("platform-preview-compare")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("platform-preview-channel-sc-pinterest"));

    // A three-column compare grid belongs to the channel it was opened
    // for; leaving it open across channels silently changes what each
    // column is claiming to show.
    const panel = within(
      screen.getByTestId("platform-preview").closest("[data-testid]")!.parentElement!,
    );
    expect(panel.queryByTestId("platform-preview-compare")).not.toBeInTheDocument();
  });
});
