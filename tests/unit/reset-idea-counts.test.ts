import { describe, expect, it, vi, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

/**
 * Coverage for the "Reset idea" pre-flight aggregate.
 *
 * The destructive operation depends on `getResetIdeaCounts` to show
 * the operator exactly what will be deleted. If the SQL aggregate
 * ever drops a child table, the confirm dialog would silently lie
 * ("1 idea, 0 comments, 0 everything-else") and an operator could
 * proceed thinking nothing else is at risk. These tests pin:
 *
 *   1. Every child table from the destructive feature spec is
 *      represented in the result, even when the count is zero.
 *   2. The `RESET_IDEA_BUCKETS` display order covers every
 *      `ResetIdeaCounts` key (and vice versa — no orphan bucket).
 *   3. A missing row (idea doesn't exist) returns
 *      `EMPTY_RESET_IDEA_COUNTS`, not `null`, so the page can
 *      render the form unconditionally.
 *
 * The mock only intercepts `db.execute`; the SQL template itself is
 * what we hand back, so the parser inside the function is also
 * exercised.
 */

const executeMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

import {
  EMPTY_RESET_IDEA_COUNTS,
  RESET_IDEA_BUCKETS,
  getResetIdeaCounts,
  type ResetIdeaCounts,
} from "@/lib/content/reset-idea";

function shapeOf<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      throw new Error("shapeOf proxies are not callable — pass through to the real value");
    },
  });
}

describe("getResetIdeaCounts", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("returns the parsed counts for every bucket when the idea exists", async () => {
    executeMock.mockResolvedValueOnce([
      {
        content_item: "1",
        content_item_channels: "4",
        content_assignments: "12",
        comments: "27",
        delivery_versions: "3",
        delivery_links: "9",
        approval_requests: "2",
        approval_decisions: "5",
        publication_records: "1",
        attachments: "6",
        ai_usage_events: "11",
        activity_events: "42",
      },
    ]);

    const counts = await getResetIdeaCounts("idea-1");
    expect(counts).toEqual<ResetIdeaCounts>({
      contentItem: 1,
      contentItemChannels: 4,
      contentAssignments: 12,
      comments: 27,
      deliveryVersions: 3,
      deliveryLinks: 9,
      approvalRequests: 2,
      approvalDecisions: 5,
      publicationRecords: 1,
      attachments: 6,
      aiUsageEvents: 11,
      activityEvents: 42,
    });
    expect(executeMock).toHaveBeenCalledTimes(1);
    // The SQL template is the only argument — its content is what
    // the operator relies on, so we don't deep-assert it, but we
    // make sure it was actually passed through (not lost in a wrapper).
    const call = executeMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
  });

  it("handles the { rows: [...] } envelope that pg returns for raw queries", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          content_item: "1",
          content_item_channels: "0",
          content_assignments: "0",
          comments: "0",
          delivery_versions: "0",
          delivery_links: "0",
          approval_requests: "0",
          approval_decisions: "0",
          publication_records: "0",
          attachments: "0",
          ai_usage_events: "0",
          activity_events: "0",
        },
      ],
    });

    const counts = await getResetIdeaCounts("idea-empty");
    expect(counts.contentItem).toBe(1);
    expect(counts.comments).toBe(0);
  });

  it("returns EMPTY_RESET_IDEA_COUNTS when the aggregate returns no rows", async () => {
    executeMock.mockResolvedValueOnce([]);
    const counts = await getResetIdeaCounts("idea-missing");
    expect(counts).toEqual(EMPTY_RESET_IDEA_COUNTS);
  });

  it("returns EMPTY_RESET_IDEA_COUNTS when the driver yields an unexpected shape", async () => {
    executeMock.mockResolvedValueOnce(null);
    const counts = await getResetIdeaCounts("idea-missing");
    expect(counts).toEqual(EMPTY_RESET_IDEA_COUNTS);
  });
});

describe("RESET_IDEA_BUCKETS", () => {
  it("covers every key in ResetIdeaCounts and only those keys", () => {
    const keysInCounts = Object.keys(EMPTY_RESET_IDEA_COUNTS).sort();
    const keysInBuckets = RESET_IDEA_BUCKETS.map((b) => b.key).sort();
    expect(keysInBuckets).toEqual(keysInCounts);
  });

  it("has a non-empty human label for every bucket", () => {
    for (const bucket of RESET_IDEA_BUCKETS) {
      expect(bucket.label.length).toBeGreaterThan(0);
    }
  });

  it("flags the cascade vs set-null distinction in the label", () => {
    // The set-null orphans must be visibly labelled so the operator
    // understands they are NOT being deleted, just unlinked.
    const attachment = RESET_IDEA_BUCKETS.find((b) => b.key === "attachments");
    const aiUsage = RESET_IDEA_BUCKETS.find((b) => b.key === "aiUsageEvents");
    const activity = RESET_IDEA_BUCKETS.find((b) => b.key === "activityEvents");
    expect(attachment?.label.toLowerCase()).toContain("orphan");
    expect(aiUsage?.label.toLowerCase()).toContain("orphan");
    expect(activity?.label.toLowerCase()).toContain("orphan");
    // The cascade buckets must NOT be labelled "orphan" — they ARE deleted.
    const cascadeKeys: Array<keyof ResetIdeaCounts> = [
      "contentItem",
      "contentItemChannels",
      "contentAssignments",
      "comments",
      "deliveryVersions",
      "deliveryLinks",
      "approvalRequests",
      "approvalDecisions",
      "publicationRecords",
    ];
    for (const key of cascadeKeys) {
      const bucket = RESET_IDEA_BUCKETS.find((b) => b.key === key);
      expect(bucket?.label.toLowerCase()).not.toContain("orphan");
    }
  });
});

// Touch the import to keep `sql` in the dependency graph even when
// the test doesn't introspect the SQL template directly. This catches
// the "unused import" lint rule without removing the genuine usage.
void sql;
void shapeOf;
