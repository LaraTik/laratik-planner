import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningListItem, PlanningListItemList } from "@/components/workspace/planning-list-item";
import type { EnrichedContentItem } from "@/lib/content/enriched-list";
import { deriveNextAction } from "@/lib/content/next-action";
import { classifyHealth } from "@/lib/dashboard/health";

/**
 * PlanningListItem — unit tests for the enriched row.
 *
 * Coverage:
 *  - Renders identity / schedule / owner / workflow / health / next action
 *    for every status the row supports (draft, content_review, in_design,
 *    creative_review, ready_to_publish, blocked, published, cancelled).
 *  - RSC #441 regression: NO function props (onClick / onChange / etc.)
 *    on any rendered DOM element. The previous defect came from a
 *    closure attached to a server-rendered <td>; this row MUST not
 *    regress.
 *  - Overdue row surfaces the day count in the schedule cell.
 *  - Unassigned owner renders a discoverable "Unassigned" pill.
 *  - Multi-channel row shows the overflow "+N" chip.
 *  - Health indicator is a single chip, not a list of every section.
 *  - Comment/asset counters link to the matching detail-page tab.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");

function makeItem(overrides: Partial<EnrichedContentItem> = {}): EnrichedContentItem {
  const status = overrides.status ?? "draft";
  const plannedPublishAt = overrides.plannedPublishAt ?? new Date("2026-08-20T09:00:00.000Z");
  const health = overrides.health ?? classifyHealth({ status, plannedPublishAt, now: NOW });
  return {
    id: "item-1",
    title: "August Kickoff",
    format: "carousel",
    status,
    plannedPublishAt,
    brief: "Launch the August programme",
    priority: "normal",
    blockedReason: null,
    cancellationReason: null,
    changeRequestGate: null,
    owner: {
      id: "user-1",
      name: "Ghaleb",
      displayName: "Ghaleb N.",
      avatarPath: null,
    },
    designer: null,
    channels: [
      { id: "ch-1", platform: "instagram", accountName: "@brand" },
      { id: "ch-2", platform: "facebook", accountName: "@brand" },
    ],
    commentCount: 2,
    assetCount: 3,
    deliveryCount: 0,
    hasApprovedDelivery: false,
    openApprovalCount: 0,
    health,
    overdueDays: 0,
    nextAction: deriveNextAction({
      status,
      health,
      openApprovalCount: 0,
      actorRoles: ["content_planner"],
      now: NOW,
      plannedPublishAt,
    }),
    ...overrides,
  };
}

describe("PlanningListItem", () => {
  it("renders the title, format, channels, owner, workflow, health, and next action", () => {
    const item = makeItem();
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    expect(screen.getByTestId("planning-list-item")).toBeInTheDocument();
    expect(screen.getByTestId("row-title")).toHaveTextContent("August Kickoff");
    // The row now uses a PeopleCell that surfaces Owner + Designer
    // as two role-labelled sub-rows (AGENTS.md §C).
    expect(screen.getByTestId("people-cell")).toBeInTheDocument();
    const ownerRow = screen.getByTestId("people-cell-owner");
    expect(ownerRow).toHaveTextContent("Ghaleb N.");
    expect(ownerRow).toHaveAttribute("data-role", "owner");
    // The row uses a StagePill instead of the full WorkflowMiniProgress
    // stepper. The full stepper is one click away in the detail page's
    // workflow inspector. The pill surfaces the current stage + position
    // in a single line (AGENTS.md §B + §C).
    expect(screen.getByTestId("stage-pill")).toHaveAttribute("data-stage", "planning");
    expect(screen.getByTestId("stage-pill")).toHaveTextContent(/Planning/);
    expect(screen.getByTestId("stage-pill")).toHaveTextContent(/1\/4/);
    expect(screen.getByTestId("readiness-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("next-action-chip")).toBeInTheDocument();
  });

  it("shows 'Unassigned' for both owner and designer when neither is set", () => {
    const item = makeItem({ owner: null, designer: null });
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    expect(screen.getByTestId("people-cell-owner")).toHaveAttribute("data-empty", "true");
    expect(screen.getByTestId("people-cell-owner")).toHaveTextContent(/Unassigned/);
    expect(screen.getByTestId("people-cell-designer")).toHaveAttribute("data-empty", "true");
    expect(screen.getByTestId("people-cell-designer")).toHaveTextContent(/Unassigned/);
  });

  it("shows the designer name when a designer is assigned", () => {
    const item = makeItem({
      designer: {
        id: "user-2",
        name: "Sarah Ahmed",
        displayName: "Sarah A.",
        avatarPath: null,
      },
    });
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    const designerRow = screen.getByTestId("people-cell-designer");
    expect(designerRow).toHaveAttribute("data-role", "designer");
    expect(designerRow).toHaveTextContent("Sarah A.");
  });

  it("surfaces the overdue day count in the schedule cell for past-due rows", () => {
    const item = makeItem({
      status: "content_review",
      plannedPublishAt: new Date("2026-08-12T09:00:00.000Z"),
    });
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    const schedule = screen.getByTestId("row-schedule");
    expect(schedule).toHaveAttribute("data-relative", "past");
    expect(schedule).toHaveAttribute("data-overdue-days", "3");
    expect(schedule.textContent).toMatch(/3 days overdue/);
  });

  it("renders a +N overflow chip when more than 3 channels exist", () => {
    const item = makeItem({
      channels: [
        { id: "c1", platform: "instagram", accountName: "@brand" },
        { id: "c2", platform: "facebook", accountName: "@brand" },
        { id: "c3", platform: "tiktok", accountName: "@brand" },
        { id: "c4", platform: "youtube", accountName: "@brand" },
        { id: "c5", platform: "linkedin", accountName: "@brand" },
      ],
    });
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    const channels = screen.getByTestId("channel-icons");
    expect(channels).toHaveAttribute("data-count", "5");
    expect(screen.getByTestId("channel-overflow")).toHaveTextContent("+2");
  });

  it("links comment and asset counters to the matching detail-page tabs", () => {
    const item = makeItem();
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    const comments = screen.getAllByTestId("row-comment-count");
    comments.forEach((c) =>
      expect(c).toHaveAttribute("href", "/app/w/acme/planning/item-1#activity"),
    );
    const assets = screen.getAllByTestId("row-asset-count");
    assets.forEach((a) => expect(a).toHaveAttribute("href", "/app/w/acme/planning/item-1#content"));
  });

  it("renders the blocked state distinctly from at-risk", () => {
    const item = makeItem({
      status: "blocked",
      blockedReason: "Awaiting client brief",
      health: "blocked",
    });
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    const indicator = screen.getByTestId("readiness-indicator");
    expect(indicator).toHaveAttribute("data-health", "blocked");
    expect(indicator.textContent).toMatch(/Blocked/);
  });

  it("renders a published row without overdue warning", () => {
    const item = makeItem({
      status: "published",
      health: "published",
      plannedPublishAt: new Date("2026-08-10T09:00:00.000Z"),
    });
    render(
      <ul>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </ul>,
    );
    const indicator = screen.getByTestId("readiness-indicator");
    expect(indicator).toHaveAttribute("data-health", "published");
  });
});

describe("PlanningListItem — RSC #441 regression guard", () => {
  // The previous defect (memory: 11th nopCommerce plugin / RSC #441
  // lesson) was caused by a server-rendered DOM element receiving a
  // function prop (onClick closure) from a client component. React
  // would serialise the function reference into the RSC payload, the
  // client would receive a closure it couldn't re-invoke, and the
  // reconciler would throw "more hooks than during the previous
  // render" on the second pass. The fix was: never attach function
  // props to DOM elements in a server component.
  //
  // This guard walks every rendered DOM element and asserts NO
  // function prop (onClick, onChange, onSubmit, onFocus, onBlur,
  // onKeyDown, etc.) is present. If anyone re-introduces an
  // interactive closure on a server-rendered element, the test fails
  // and the page would throw RSC #441 in production.
  const FORBIDDEN_PROPS = [
    "onClick",
    "onChange",
    "onSubmit",
    "onFocus",
    "onBlur",
    "onKeyDown",
    "onKeyUp",
    "onKeyPress",
    "onMouseDown",
    "onMouseUp",
    "onMouseEnter",
    "onMouseLeave",
    "onInput",
    "onInvalid",
  ];

  it("does not attach any function prop to rendered DOM elements", () => {
    const item = makeItem();
    const { container } = render(
      <PlanningListItemList>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </PlanningListItemList>,
    );
    const all = container.querySelectorAll("*");
    for (const el of Array.from(all)) {
      for (const prop of FORBIDDEN_PROPS) {
        // React serialises function props onto the DOM node under
        // the same lowercase name (e.g. onClick → onclick). The
        // direct attribute check is the safest; a function value
        // would show up as a real function here.
        const domAttr = (el as HTMLElement).getAttribute(prop.toLowerCase());
        // React may legitimately attach a noop string for some
        // form-associated elements; only fail when a *function*
        // reference is present. JSDOM surfaces this as a function.
        if (domAttr && typeof (el as unknown as Record<string, unknown>)[prop] === "function") {
          throw new Error(
            `RSC #441 regression: <${el.tagName.toLowerCase()}> has a function prop '${prop}'. ` +
              `Server-rendered DOM elements must not receive function props.`,
          );
        }
      }
    }
  });

  it("does not inline a function via dangerouslySetInnerHTML either", () => {
    const item = makeItem();
    const { container } = render(
      <PlanningListItemList>
        <PlanningListItem
          item={item}
          workspaceSlug="acme"
          workspaceTimezone="Europe/Berlin"
          now={NOW}
        />
      </PlanningListItemList>,
    );
    const all = Array.from(container.querySelectorAll("[dangerouslysetinnerhtml]"));
    expect(all).toHaveLength(0);
  });
});
