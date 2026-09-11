import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChannelIcons } from "@/components/workspace/channel-icons";

const channels = [
  { id: "ig", platform: "instagram", accountName: "Acme Instagram" },
  { id: "fb", platform: "facebook", accountName: "Acme Facebook" },
  { id: "tt", platform: "tiktok", accountName: "Acme TikTok" },
];

describe("ChannelIcons", () => {
  it("uses the active catalog for tooltip and screen-reader labels", () => {
    const t = (key: string) => {
      const labels: Record<string, string> = {
        "contentDetail.publishForm.platformLabels.instagram": "إنستغرام",
        "contentDetail.publishForm.platformLabels.facebook": "فيسبوك",
        "contentDetail.publishForm.platformLabels.tiktok": "تيك توك",
      };
      return labels[key] ?? key;
    };

    render(<ChannelIcons channels={channels} max={2} t={t} />);

    expect(screen.getByRole("img", { name: "إنستغرام" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "فيسبوك" })).toBeInTheDocument();
    expect(screen.getByTestId("channel-overflow")).toHaveAttribute("title", "تيك توك");
    expect(screen.getByText("إنستغرام, فيسبوك, تيك توك")).toBeInTheDocument();
  });

  it("keeps a readable fallback when no translator is supplied", () => {
    render(
      <ChannelIcons
        channels={[{ id: "ig", platform: "instagram", accountName: "Acme Instagram" }]}
      />,
    );
    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
  });

  it("explains an empty channel list with the localized empty label", () => {
    render(<ChannelIcons channels={[]} emptyLabel="لا توجد قنوات" />);
    expect(screen.getByRole("status", { name: "لا توجد قنوات" })).toHaveTextContent(
      "لا توجد قنوات",
    );
  });
});
