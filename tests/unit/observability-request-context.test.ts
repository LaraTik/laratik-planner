import { describe, expect, it } from "vitest";
import { getRequestId, runWithRequestContext } from "@/lib/observability/request-context";

describe("request-context (AsyncLocalStorage)", () => {
  it("returns undefined when no context is active", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("exposes the requestId set via runWithRequestContext", () => {
    runWithRequestContext({ requestId: "trace-1" }, () => {
      expect(getRequestId()).toBe("trace-1");
    });
  });

  it("propagates the id through async boundaries (await)", async () => {
    await runWithRequestContext({ requestId: "trace-await" }, async () => {
      await Promise.resolve();
      expect(getRequestId()).toBe("trace-await");
      await new Promise((r) => setTimeout(r, 0));
      expect(getRequestId()).toBe("trace-await");
    });
  });

  it("isolates nested contexts (inner shadows outer)", () => {
    runWithRequestContext({ requestId: "outer" }, () => {
      expect(getRequestId()).toBe("outer");
      runWithRequestContext({ requestId: "inner" }, () => {
        expect(getRequestId()).toBe("inner");
      });
      // After inner unwinds, the outer value is restored.
      expect(getRequestId()).toBe("outer");
    });
  });

  it("the context is undefined once the scope unwinds", () => {
    runWithRequestContext({ requestId: "x" }, () => {
      expect(getRequestId()).toBe("x");
    });
    expect(getRequestId()).toBeUndefined();
  });
});
