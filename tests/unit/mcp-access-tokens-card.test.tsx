import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/components/i18n/locale-provider";

vi.mock("@/app/(app)/app/account/actions", () => ({
  issueMcpTokenAction: vi.fn(),
  revokeMcpTokenAction: vi.fn(),
}));

import { McpAccessTokensCard } from "@/app/(app)/app/account/mcp-access-tokens-card";

const TOKEN = {
  id: "00000000-0000-0000-0000-000000000010",
  name: "Claude",
  tokenPrefix: "lpm_abc123",
  scopes: ["content:read"],
  expiresAt: new Date("2026-12-12T10:00:00.000Z"),
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date("2026-09-13T10:00:00.000Z"),
};

function renderCard() {
  return render(
    <LocaleProvider locale="en">
      <McpAccessTokensCard tokens={[TOKEN]} />
    </LocaleProvider>,
  );
}

describe("McpAccessTokensCard", () => {
  it("makes the endpoint and least-privilege warning visible", () => {
    renderCard();

    expect(screen.getByText("Connection endpoint")).toBeInTheDocument();
    expect(screen.getByText("https://planner.laratik.com/api/mcp")).toBeInTheDocument();
    expect(screen.getByText("Only enable this for trusted automations.")).toBeInTheDocument();
  });

  it("uses an accessible confirmation dialog for token revocation", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /^Revoke$/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Revoke MCP token?" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Connected clients will stop working/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^Revoke$/ })).toBeInTheDocument();
  });
});
