import { describe, expect, it } from "vitest";
import {
  isProviderReply,
  providerReplyIsLatest,
  syncedMessageState,
} from "@/lib/community/comment-sync-state";

describe("community comment sync state", () => {
  it("marks a comment authored by the connected account as an existing reply", () => {
    expect(isProviderReply("page-1", "page-1")).toBe(true);
    expect(syncedMessageState(true)).toEqual({
      direction: "outgoing",
      conversationState: "waiting_customer",
      deliveryState: "sent",
    });
  });

  it("keeps customer comments open for an operator response", () => {
    expect(isProviderReply("customer-1", "page-1")).toBe(false);
    expect(syncedMessageState(false)).toEqual({
      direction: "incoming",
      conversationState: "open",
      deliveryState: "received",
    });
  });

  it("does not classify an unknown author as the provider account", () => {
    expect(isProviderReply(null, "page-1")).toBe(false);
    expect(isProviderReply("", "")).toBe(false);
  });

  it("blocks a duplicate reply only while the provider reply is latest", () => {
    expect(
      providerReplyIsLatest({
        conversationState: "waiting_customer",
        latestDirection: "outgoing",
        latestDeliveryState: "sent",
        latestAuthorExternalId: "page-1",
        providerAccountId: "page-1",
      }),
    ).toBe(true);
    expect(
      providerReplyIsLatest({
        conversationState: "open",
        latestDirection: "outgoing",
        latestDeliveryState: "sent",
        latestAuthorExternalId: "page-1",
        providerAccountId: "page-1",
      }),
    ).toBe(false);
  });
});
