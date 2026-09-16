import { describe, expect, it } from "vitest";
import { MediaSelectionStoreImpl } from "@/lib/media/selection-store";
import { MAX_BULK_SELECTION } from "@/lib/media/bulk-cap";

describe("media selection store", () => {
  function makeStore() {
    const instance = new MediaSelectionStoreImpl();
    instance.setCanWrite(true);
    return instance;
  }

  it("starts empty", () => {
    const store = makeStore();
    expect(store.getState().selected.size).toBe(0);
  });

  it("toggles single ids", () => {
    const store = makeStore();
    store.toggle("a");
    expect(store.getState().selected.has("a")).toBe(true);
    expect(store.getState().lastClickedId).toBe("a");
    store.toggle("a");
    expect(store.getState().selected.has("a")).toBe(false);
  });

  it("refuses toggle when the actor cannot write", () => {
    const instance = new MediaSelectionStoreImpl();
    instance.toggle("a");
    expect(instance.getState().selected.size).toBe(0);
  });

  it("caps the selection at MAX_BULK_SELECTION", () => {
    const store = makeStore();
    for (let i = 0; i < MAX_BULK_SELECTION; i += 1) {
      store.toggle(`id-${i}`);
    }
    expect(store.getState().selected.size).toBe(MAX_BULK_SELECTION);
    store.toggle("overflow");
    expect(store.getState().selected.size).toBe(MAX_BULK_SELECTION);
    expect(store.getState().selected.has("overflow")).toBe(false);
  });

  it("setMany replaces the selection", () => {
    const store = makeStore();
    store.toggle("a");
    store.toggle("b");
    store.setMany(["c", "d"]);
    expect(store.getState().selected.has("a")).toBe(false);
    expect(store.getState().selected.has("b")).toBe(false);
    expect(store.getState().selected.has("c")).toBe(true);
    expect(store.getState().selected.has("d")).toBe(true);
  });

  it("clears the selection", () => {
    const store = makeStore();
    store.toggle("a");
    store.clear();
    expect(store.getState().selected.size).toBe(0);
  });

  it("selectRange adds every id between two anchors (inclusive)", () => {
    const store = makeStore();
    const ids = ["a", "b", "c", "d", "e"];
    store.selectRange(ids, "a", "c");
    expect([...store.getState().selected].sort()).toEqual(["a", "b", "c"]);
  });

  it("selectRange handles reversed anchors", () => {
    const store = makeStore();
    const ids = ["a", "b", "c", "d", "e"];
    store.selectRange(ids, "e", "b");
    expect([...store.getState().selected].sort()).toEqual(["b", "c", "d", "e"]);
  });
});
