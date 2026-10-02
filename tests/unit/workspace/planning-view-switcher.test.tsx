import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanningViewSwitcher } from "@/components/workspace/planning-view-switcher";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("PlanningViewSwitcher", () => {
  it("renders all planning views and marks only the current view", () => {
    render(
      <PlanningViewSwitcher
        active="board"
        links={{ list: "/planning", board: "/board", calendar: "/calendar" }}
        t={(key) =>
          ({
            "planning.viewSwitcherAria": "Planning view",
            "planning.viewList": "List",
            "planning.viewBoard": "Board",
            "planning.viewCalendar": "Calendar",
          })[key] ?? key
        }
      />,
    );

    expect(screen.getByRole("navigation", { name: "Planning view" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "List" })).toHaveAttribute("href", "/planning");
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Calendar" })).not.toHaveAttribute("aria-current");
  });
});
