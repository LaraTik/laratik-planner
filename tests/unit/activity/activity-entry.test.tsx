import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityEntry } from "@/components/activity/activity-entry";
import type { ActivityRenderSpec } from "@/lib/activity/types";

function makeSpec(partial: Partial<ActivityRenderSpec>): ActivityRenderSpec {
  return {
    id: "ev-1",
    kind: "status_transition",
    verb: "moved Spring drop from Draft to Content review",
    actor: { id: "user-1", name: "Ada Lovelace", toneSeed: "Ada Lovelace", href: null },
    target: { label: "Spring drop", href: "/app/w/acme/planning/abc" },
    metadataLabel: null,
    diff: null,
    iconKind: "status_transition",
    toneClass: "border-primary/30 bg-primary-subtle text-primary",
    occurredAtIso: "2026-09-27T10:00:00.000Z",
    ...partial,
  };
}

describe("ActivityEntry", () => {
  it("renders actor, verb, target, and timestamp", () => {
    render(
      <ul>
        <ActivityEntry
          spec={makeSpec({})}
          renderTime={(iso) => <time dateTime={iso}>formatted: {iso}</time>}
        />
      </ul>,
    );
    const item = screen.getByTestId("activity-entry");
    expect(item).toHaveTextContent("Ada Lovelace");
    expect(item).toHaveTextContent("moved Spring drop from Draft to Content review");
    expect(within(item).getByTestId("activity-entry-target")).toHaveTextContent("Spring drop");
    expect(within(item).getByTestId("activity-entry-time-row")).toHaveTextContent(
      "formatted: 2026-09-27T10:00:00.000Z",
    );
  });

  it("emits data-* attributes for filter / data tests", () => {
    render(
      <ul>
        <ActivityEntry
          spec={makeSpec({
            kind: "publication",
            actor: { id: "u2", name: "Ghaleb", toneSeed: "Ghaleb", href: null },
          })}
          renderTime={(iso) => <>{iso}</>}
        />
      </ul>,
    );
    const item = screen.getByTestId("activity-entry");
    expect(item.getAttribute("data-event-kind")).toBe("publication");
    expect(item.getAttribute("data-actor-id")).toBe("u2");
    expect(item.getAttribute("data-target-id")).toBe("Spring drop");
  });

  it("renders the diff chip when the spec carries a diff", () => {
    render(
      <ul>
        <ActivityEntry
          spec={makeSpec({
            diff: {
              field: "status",
              fieldLabel: "Status",
              before: { label: "Draft" },
              after: { label: "Content review" },
              shape: "chip",
            },
          })}
          renderTime={() => null}
        />
      </ul>,
    );
    expect(screen.getByTestId("activity-diff-chip")).toBeInTheDocument();
  });

  it("renders a target link when target.href is present", () => {
    render(
      <ul>
        <ActivityEntry spec={makeSpec({})} renderTime={() => null} />
      </ul>,
    );
    const target = screen.getByTestId("activity-entry-target");
    expect(target.tagName.toLowerCase()).toBe("a");
    expect(target.getAttribute("href")).toBe("/app/w/acme/planning/abc");
  });

  it("renders metadata suffix when metadataLabel is present", () => {
    render(
      <ul>
        <ActivityEntry
          spec={makeSpec({ metadataLabel: "Instagram · LaraTik Main" })}
          renderTime={() => null}
        />
      </ul>,
    );
    expect(screen.getByTestId("activity-entry-metadata")).toHaveTextContent(
      "Instagram · LaraTik Main",
    );
  });
});
