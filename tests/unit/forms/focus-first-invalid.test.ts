import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";

/**
 * Plan §4 — "focus first error on submit" + "honour
 * prefers-reduced-motion".
 *
 * Resolution order:
 *   1. First control with `aria-invalid="true"`.
 *   2. First required control with a name.
 *   3. First focusable descendant.
 */
describe("focusFirstInvalid", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the first aria-invalid control", () => {
    document.body.innerHTML = `
      <form id="f">
        <input id="ok" name="ok" />
        <input id="bad1" name="bad1" aria-invalid="true" />
        <input id="bad2" name="bad2" aria-invalid="true" />
      </form>
    `;
    const form = document.getElementById("f") as HTMLFormElement;
    const result = focusFirstInvalid(form);
    expect(result?.id).toBe("bad1");
  });

  it("falls back to the first required control with a name", () => {
    document.body.innerHTML = `
      <form id="f">
        <input id="plain" name="plain" />
        <input id="required" name="required" required />
      </form>
    `;
    const form = document.getElementById("f") as HTMLFormElement;
    const result = focusFirstInvalid(form);
    expect(result?.id).toBe("required");
  });

  it("falls back to the first focusable descendant", () => {
    document.body.innerHTML = `
      <form id="f">
        <button id="btn" type="button">go</button>
      </form>
    `;
    const form = document.getElementById("f") as HTMLFormElement;
    const result = focusFirstInvalid(form);
    expect(result?.id).toBe("btn");
  });

  it("returns null when the form is null or missing", () => {
    expect(focusFirstInvalid(null)).toBeNull();
  });

  it("returns null when the form has no focusable descendants", () => {
    document.body.innerHTML = `<form id="f"><span>nothing focusable</span></form>`;
    const form = document.getElementById("f") as HTMLFormElement;
    expect(focusFirstInvalid(form)).toBeNull();
  });
});
