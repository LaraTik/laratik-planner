import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { tFor } from "@/messages";
import {
  ConnectionStatusBadge,
  ConnectionStatusDot,
} from "@/app/(app)/app/w/[slug]/channels/connection-status-badge";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ConnectionStatusDot", () => {
  it("localizes the compact status title and description", () => {
    render(<ConnectionStatusDot status="needs_reauth" t={tFor("ar")} />);

    const dot = screen.getByTestId("connection-status-dot-needs_reauth");
    expect(dot).toHaveAttribute("title", "تحتاج إلى إعادة الاتصال");
    expect(dot).toHaveAttribute(
      "aria-label",
      "حدثت ثلاث إخفاقات متتالية في المصادقة أو الصلاحيات. أعد الاتصال للمتابعة.",
    );
  });

  it("keeps the English fallback when no translator is supplied", () => {
    render(<ConnectionStatusDot status="manual" />);

    const dot = screen.getByTestId("connection-status-dot-manual");
    expect(dot).toHaveAttribute("title", "Manual");
    expect(dot).toHaveAttribute(
      "aria-label",
      "Channel has no provider connection. Manually managed.",
    );
  });

  it("describes delayed sync in plain language", () => {
    render(<ConnectionStatusDot status="sync_error" t={tFor("en")} />);

    expect(screen.getByTestId("connection-status-dot-sync_error")).toHaveAttribute(
      "aria-label",
      "A temporary provider error occurred. Automatic sync will retry.",
    );
  });

  it("does not present an old connected channel as healthy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));

    render(
      <ConnectionStatusBadge
        status="connected"
        lastSyncedAt={new Date("2026-09-09T00:00:00Z")}
        t={tFor("en")}
      />,
    );

    expect(screen.getByText("Sync delayed")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });
});
