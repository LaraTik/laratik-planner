import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";

const actions = vi.hoisted(() => ({
  list: vi.fn(),
  link: vi.fn(),
  record: vi.fn(),
  refresh: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  listMetaPublicationCandidatesAction: actions.list,
  linkMetaPublicationAction: actions.link,
  recordPublicationAction: actions.record,
  refreshMetaPublicationAction: actions.refresh,
  unlinkMetaPublicationAction: actions.unlink,
}));

const { ChannelPublishingCard } = await import("@/components/planning/channel-publishing-card");

const candidate = {
  id: "meta-post-1",
  platform: "instagram" as const,
  status: "published" as const,
  caption: "Launch announcement",
  mediaType: "image" as const,
  permalink: "https://instagram.com/p/meta-post-1",
  thumbnailUrl: "https://cdn.example.test/thumb.jpg",
  createdAt: "2026-09-21T12:00:00.000Z",
  scheduledAt: null,
  publishedAt: "2026-09-21T12:00:00.000Z",
};

const channel = {
  id: "content-channel-1",
  platform: "instagram",
  accountName: "Acme IG",
  configured: true,
  connectionStatus: "connected",
  externalAccountId: "ig-account-1",
  targetDate: "2026-09-21T12:00:00.000Z",
  searchText: "Launch announcement",
  timeZone: "Europe/Berlin",
};

describe("Meta publication linking UI", () => {
  it("loads candidates, keeps the best candidate selected, and links after confirmation", async () => {
    actions.list.mockResolvedValue({ ok: true, candidates: [candidate], nextCursor: null });
    actions.link.mockResolvedValue({ ok: true });

    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={channel}
          publication={null}
          isPublisher={true}
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Link Meta post" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Launch announcement")).toBeInTheDocument();

    const radio = screen.getByRole("radio") as HTMLInputElement;
    expect(radio.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Link selected post" }));

    await waitFor(() =>
      expect(actions.link).toHaveBeenCalledWith({
        workspaceSlug: "acme",
        contentItemChannelId: "content-channel-1",
        externalPostId: "meta-post-1",
      }),
    );
  });

  it("recovers from a rejected candidate request instead of leaving the dialog stuck", async () => {
    actions.list.mockRejectedValue(new Error("temporary failure"));

    render(
      <LocaleProvider locale="ar">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={channel}
          publication={null}
          isPublisher={true}
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ربط منشور Meta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الوصول إلى Meta");
    expect(screen.getByRole("button", { name: "ربط المنشور المحدد" })).toBeDisabled();
  });
});
