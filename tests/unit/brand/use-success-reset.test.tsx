import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import * as React from "react";
import { useSuccessReset } from "@/lib/brand/use-success-reset";

function makeRef(current: HTMLFormElement | null): React.RefObject<HTMLFormElement> {
  return { current } as React.RefObject<HTMLFormElement>;
}

type FormState = { success?: boolean; error?: string } | undefined;

describe("useSuccessReset", () => {
  it("resets the form when state.success flips to true", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    const ref = makeRef(form);
    const reset = vi.spyOn(form, "reset");
    const { rerender } = renderHook(({ s }) => useSuccessReset(s, ref), {
      initialProps: { s: undefined as FormState },
    });
    rerender({ s: { success: true } });
    expect(reset).toHaveBeenCalledTimes(1);
    document.body.removeChild(form);
  });

  it("does not reset on error", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    const ref = makeRef(form);
    const reset = vi.spyOn(form, "reset");
    const { rerender } = renderHook(({ s }) => useSuccessReset(s, ref), {
      initialProps: { s: undefined as FormState },
    });
    rerender({ s: { error: "Boom" } });
    expect(reset).not.toHaveBeenCalled();
    document.body.removeChild(form);
  });

  it("does not reset twice on the same success", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    const ref = makeRef(form);
    const reset = vi.spyOn(form, "reset");
    const { rerender } = renderHook(({ s }) => useSuccessReset(s, ref), {
      initialProps: { s: undefined as FormState },
    });
    rerender({ s: { success: true } });
    rerender({ s: { success: true } });
    expect(reset).toHaveBeenCalledTimes(1);
    document.body.removeChild(form);
  });

  it("resets again on a new success after an error", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    const ref = makeRef(form);
    const reset = vi.spyOn(form, "reset");
    const { rerender } = renderHook(({ s }) => useSuccessReset(s, ref), {
      initialProps: { s: undefined as FormState },
    });
    rerender({ s: { success: true } });
    rerender({ s: { error: "Boom" } });
    rerender({ s: { success: true } });
    expect(reset).toHaveBeenCalledTimes(2);
    document.body.removeChild(form);
  });

  it("is a no-op when the ref is null", () => {
    const ref = makeRef(null);
    expect(() => {
      renderHook(() => useSuccessReset({ success: true }, ref));
    }).not.toThrow();
  });
});
