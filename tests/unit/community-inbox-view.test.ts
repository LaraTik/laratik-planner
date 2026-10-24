import { describe, expect, it } from "vitest";
import { communityInboxView, latestInboxConversations } from "@/lib/community/inbox-view";

const items = [
  { id: "public", visibility: "public", body: "Opening hours", authorName: "Alice" },
  { id: "private", visibility: "private", body: "Booking question", authorName: "Bob" },
];
describe("Community inbox selection", () => {
  it("keeps the newest message when a descending query returns multiple rows per conversation", () => {
    const rows = [
      { id: "one", body: "Latest reply" },
      { id: "two", body: "Other" },
      { id: "one", body: "Old question" },
    ];
    expect(latestInboxConversations(rows)).toEqual(rows.slice(0, 2));
  });
  it("selects the requested visible conversation", () => {
    expect(communityInboxView(items, { conversation: "private" }).selected?.id).toBe("private");
  });
  it("filters private messages and never selects a hidden conversation", () => {
    const view = communityInboxView(items, { filter: "private", conversation: "public" });
    expect(view.items.map((item) => item.id)).toEqual(["private"]);
    expect(view.selected?.id).toBe("private");
  });
  it("searches message text and author without case sensitivity", () => {
    expect(communityInboxView(items, { q: " ALICE " }).selected?.id).toBe("public");
    expect(communityInboxView(items, { q: "BOOKING" }).selected?.id).toBe("private");
    expect(communityInboxView(items, { q: "missing" }).selected).toBeNull();
  });
});
