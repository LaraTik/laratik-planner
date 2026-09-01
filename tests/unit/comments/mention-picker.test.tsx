import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentionPicker, type MentionableUser } from "@/components/comments/mention-picker";
import { tFor } from "@/messages";

const t = tFor("en");

const SAMPLE: MentionableUser[] = [
  {
    id: "u-1",
    displayName: "Ada Lovelace",
    email: "ada@laratik.test",
    image: null,
    roleLabel: "Workspace Manager",
    isAgencyAdmin: false,
  },
  {
    id: "u-2",
    displayName: "Grace Hopper",
    email: "grace@laratik.test",
    image: null,
    roleLabel: "Content Planner",
    isAgencyAdmin: false,
  },
  {
    id: "u-3",
    displayName: "Platform Admin",
    email: "admin@laratik.test",
    image: null,
    roleLabel: null,
    isAgencyAdmin: true,
  },
];

describe("MentionPicker", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MentionPicker
        query=""
        users={SAMPLE}
        loading={false}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
        anchorRect={null}
        open={false}
        t={t}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists the candidate users when open with results", () => {
    render(
      <MentionPicker
        query=""
        users={SAMPLE}
        loading={false}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    expect(screen.getByTestId("mention-option-u-1")).toBeInTheDocument();
    expect(screen.getByTestId("mention-option-u-2")).toBeInTheDocument();
    expect(screen.getByTestId("mention-option-u-3")).toBeInTheDocument();
  });

  it("highlights the active option with aria-selected", () => {
    render(
      <MentionPicker
        query=""
        users={SAMPLE}
        loading={false}
        highlightedIndex={1}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    expect(screen.getByTestId("mention-option-u-1")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("mention-option-u-2")).toHaveAttribute("aria-selected", "true");
  });

  it("renders role and admin hints next to the name", () => {
    render(
      <MentionPicker
        query=""
        users={SAMPLE}
        loading={false}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    expect(screen.getByText("Workspace Manager")).toBeInTheDocument();
    expect(screen.getByText("Content Planner")).toBeInTheDocument();
    expect(screen.getByText("Agency admin")).toBeInTheDocument();
  });

  it("shows a spinner while loading", () => {
    render(
      <MentionPicker
        query=""
        users={[]}
        loading
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    expect(screen.getByText(/Searching/i)).toBeInTheDocument();
  });

  it("shows a friendly empty state when no users match", () => {
    render(
      <MentionPicker
        query="nobody"
        users={[]}
        loading={false}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    expect(screen.getByText(/No teammates match/i)).toBeInTheDocument();
  });

  it("calls onSelect when a user is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <MentionPicker
        query=""
        users={SAMPLE}
        loading={false}
        highlightedIndex={0}
        onSelect={onSelect}
        onHighlight={vi.fn()}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    await userEvent.click(screen.getByTestId("mention-option-u-2"));
    expect(onSelect).toHaveBeenCalledWith(SAMPLE[1]);
  });

  it("calls onHighlight on hover", async () => {
    const onHighlight = vi.fn();
    render(
      <MentionPicker
        query=""
        users={SAMPLE}
        loading={false}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlight={onHighlight}
        anchorRect={{ left: 0, top: 0, width: 300 }}
        open
        t={t}
      />,
    );
    await userEvent.hover(screen.getByTestId("mention-option-u-2"));
    expect(onHighlight).toHaveBeenCalledWith(1);
  });
});
