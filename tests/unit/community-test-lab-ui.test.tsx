import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityTestLab } from "@/components/community/community-test-lab";

const copy = new Proxy({}, { get: (_target, key) => String(key) }) as ComponentProps<
  typeof CommunityTestLab
>["copy"];

describe("Community Test Lab errors", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ["community_reply_drafts_disabled", "aiDisabled"],
    ["community_reply_drafts_not_in_plan", "notInPlan"],
    ["ai_rate_limited", "rateLimited"],
    ["ai_quota_exceeded", "quotaExceeded"],
    ["community_test_lab_failed", "failed"],
  ])("explains %s without presenting it as a review decision", async (error, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error }) }));
    render(<CommunityTestLab agencySlug="agency" workspaceSlug="workspace" copy={copy} />);
    fireEvent.change(screen.getByLabelText("message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "run" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expected));
  });
});
