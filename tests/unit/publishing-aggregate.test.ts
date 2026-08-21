import { describe, expect, it } from "vitest";
import { derivePublicationAggregate } from "@/lib/publishing/aggregate";

describe("derivePublicationAggregate", () => {
  it("returns ready_to_publish when nothing has been recorded yet", () => {
    expect(derivePublicationAggregate(3, [])).toBe("ready_to_publish");
  });

  it("returns partially_published when at least one channel is closed but not all", () => {
    expect(derivePublicationAggregate(3, ["published", "pending"])).toBe("partially_published");
    expect(derivePublicationAggregate(3, ["skipped", "pending", "failed"])).toBe(
      "partially_published",
    );
  });

  it("returns published only when every selected channel is published or skipped", () => {
    expect(derivePublicationAggregate(2, ["published", "skipped"])).toBe("published");
    expect(derivePublicationAggregate(3, ["published", "skipped", "skipped"])).toBe("published");
    expect(derivePublicationAggregate(3, ["skipped", "skipped", "skipped"])).toBe("published");
    expect(derivePublicationAggregate(1, ["published"])).toBe("published");
  });

  it("does not return published when any channel is failed or pending", () => {
    expect(derivePublicationAggregate(2, ["published", "failed"])).toBe("partially_published");
    expect(derivePublicationAggregate(2, ["published", "pending"])).toBe("partially_published");
  });

  it("throws when there are zero selected channels", () => {
    expect(() => derivePublicationAggregate(0, [])).toThrow(/at least one/i);
  });

  it("throws when recorded status count exceeds the selected channel count", () => {
    expect(() => derivePublicationAggregate(1, ["published", "skipped"])).toThrow(/exceeds/i);
  });
});
