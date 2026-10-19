import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommunityActivity } from "@/components/community/community-activity";

describe("Community activity", () => {
  it("renders recorded events without exposing provider detail or metadata", () => {
    render(
      <CommunityActivity
        events={[
          {
            id: "one",
            kind: "community_reply_sent",
            detail: "secret-provider-detail",
            createdAt: new Date("2026-10-19T10:00:00Z"),
          },
          {
            id: "two",
            kind: "__proto__",
            detail: "constructor",
            createdAt: new Date("2026-10-19T09:00:00Z"),
          },
        ]}
        labels={{ community_reply_sent: "Reply sent" }}
        fallbackLabel="Activity recorded"
        emptyLabel="No events"
        locale="en"
        timeZone="Europe/Berlin"
      />,
    );
    expect(screen.getByText("Reply sent")).toBeInTheDocument();
    expect(screen.getByText("Activity recorded")).toBeInTheDocument();
    expect(screen.queryByText(/secret-provider-detail/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });

  it("explains an empty activity history", () => {
    render(
      <CommunityActivity
        events={[]}
        labels={{}}
        fallbackLabel="Activity recorded"
        emptyLabel="No events"
        locale="ar"
        timeZone="Asia/Riyadh"
      />,
    );
    expect(screen.getByText("No events")).toBeInTheDocument();
  });
});
