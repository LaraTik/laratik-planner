import { describe, expect, it } from "vitest";
import { derivePublicationAggregate } from "@/lib/publishing/aggregate";

describe("publication aggregate", () => {
  it("stays ready when no selected channel is closed", () => {
    expect(derivePublicationAggregate(3, ["failed"])).toBe("ready_to_publish");
    expect(derivePublicationAggregate(3, [])).toBe("ready_to_publish");
  });

  it("becomes partial after any published or skipped channel", () => {
    expect(derivePublicationAggregate(3, ["published"])).toBe("partially_published");
    expect(derivePublicationAggregate(3, ["skipped", "failed"])).toBe("partially_published");
  });

  it("becomes published only when every selected channel is published or skipped", () => {
    expect(derivePublicationAggregate(3, ["published", "skipped", "published"])).toBe("published");
    expect(derivePublicationAggregate(3, ["published", "skipped", "failed"])).toBe(
      "partially_published",
    );
  });

  it("rejects impossible counts and a content item without channels", () => {
    expect(() => derivePublicationAggregate(0, [])).toThrow(/channel/i);
    expect(() => derivePublicationAggregate(1, ["published", "skipped"])).toThrow(/count/i);
  });
});
