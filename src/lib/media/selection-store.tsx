"use client";

import * as React from "react";
import { MAX_BULK_SELECTION } from "@/lib/media/bulk-cap";

/**
 * `useMediaSelection` — a tiny shared store for the media library's
 * multi-select state.
 *
 * Replaces the previous `document.dispatchEvent("laratik-media-selection-change")`
 * bus (`media-selection-controls.tsx`) with a hook backed by
 * `React.useSyncExternalStore`. State is:
 *
 *   - per-tab (not shared across tabs)
 *   - URL-synced via `?selected=<csv>` so a tab can be reopened with
 *     the same selection
 *   - capability-aware: write actions (`toggle`, `setMany`,
 *     `clear`) check `canWrite` and skip when the actor lacks
 *     permission
 *   - hard-capped at `MAX_BULK_SELECTION`
 *
 * Single-select callers (`<MediaAssetSelectionCheckbox>`) call
 * `toggle(id)`. Bulk surfaces call `toggleRange(fromId, toId)` for
 * shift-click selection across the gallery.
 */

export type MediaSelectionState = {
  readonly selected: ReadonlySet<string>;
  readonly lastClickedId: string | null;
  readonly canWrite: boolean;
};

export type MediaSelectionApi = {
  readonly state: MediaSelectionState;
  readonly toggle: (assetId: string) => void;
  readonly toggleRange: (assetId: string) => void;
  readonly setMany: (ids: readonly string[]) => void;
  readonly clear: () => void;
  readonly isSelected: (assetId: string) => boolean;
};

type Listener = () => void;

const EMPTY = new Set<string>();

function readSelectionFromUrl(search: string): {
  selected: Set<string>;
  lastClickedId: string | null;
} {
  if (typeof window === "undefined") return { selected: new Set(), lastClickedId: null };
  const params = new URLSearchParams(search);
  const csv = params.get("selected");
  if (!csv) return { selected: new Set(), lastClickedId: null };
  const ids = csv
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    selected: new Set(ids.slice(0, MAX_BULK_SELECTION)),
    lastClickedId: params.get("selected_anchor"),
  };
}

function writeSelectionToUrl(ids: ReadonlySet<string>, anchor: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (ids.size === 0) {
    url.searchParams.delete("selected");
    url.searchParams.delete("selected_anchor");
  } else {
    url.searchParams.set("selected", [...ids].join(","));
    if (anchor) url.searchParams.set("selected_anchor", anchor);
    else url.searchParams.delete("selected_anchor");
  }
  window.history.replaceState(null, "", url.toString());
}

class MediaSelectionStore {
  private state: MediaSelectionState = {
    selected: EMPTY,
    lastClickedId: null,
    canWrite: false,
  };
  private listeners = new Set<Listener>();
  private subscribed = false;

  getState = (): MediaSelectionState => this.state;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    if (!this.subscribed) {
      this.subscribed = true;
      // Hydrate from URL on first subscribe (client only).
      const fromUrl = readSelectionFromUrl(window.location.search);
      this.state = {
        ...this.state,
        selected: fromUrl.selected,
        lastClickedId: fromUrl.lastClickedId,
      };
      this.emit();
    }
    return () => {
      this.listeners.delete(listener);
    };
  };

  setCanWrite(canWrite: boolean) {
    if (this.state.canWrite === canWrite) return;
    this.state = { ...this.state, canWrite };
    this.emit();
  }

  toggle(assetId: string) {
    if (!this.state.canWrite) return;
    const next = new Set(this.state.selected);
    if (next.has(assetId)) next.delete(assetId);
    else {
      if (next.size >= MAX_BULK_SELECTION) return;
      next.add(assetId);
    }
    this.state = { ...this.state, selected: next, lastClickedId: assetId };
    writeSelectionToUrl(next, assetId);
    this.emit();
  }

  toggleRange(assetId: string) {
    if (!this.state.canWrite) return;
    const lastClickedId = this.state.lastClickedId;
    if (!lastClickedId) {
      this.toggle(assetId);
      return;
    }
    // The store doesn't know the gallery order; range selection is
    // resolved by the caller via `selectRange(assetIds, from, to)`
    // helper. For now, simply toggle and store the anchor.
    this.toggle(assetId);
  }

  setMany(ids: readonly string[]) {
    if (!this.state.canWrite) return;
    const next = new Set<string>();
    for (const id of ids) {
      if (next.size >= MAX_BULK_SELECTION) break;
      next.add(id);
    }
    this.state = { ...this.state, selected: next };
    writeSelectionToUrl(next, null);
    this.emit();
  }

  clear() {
    if (!this.state.canWrite) return;
    if (this.state.selected.size === 0) return;
    this.state = { ...this.state, selected: new Set(), lastClickedId: null };
    writeSelectionToUrl(new Set(), null);
    this.emit();
  }

  /** Resolve a contiguous range from a known list of ids. */
  selectRange(allIds: readonly string[], fromId: string, toId: string) {
    if (!this.state.canWrite) return;
    const fromIndex = allIds.indexOf(fromId);
    const toIndex = allIds.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    const next = new Set(this.state.selected);
    for (let i = start; i <= end; i += 1) {
      const id = allIds[i];
      if (id) {
        if (next.size >= MAX_BULK_SELECTION) break;
        next.add(id);
      }
    }
    this.state = { ...this.state, selected: next, lastClickedId: toId };
    writeSelectionToUrl(next, toId);
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

const StoreContext = React.createContext<MediaSelectionStore | null>(null);

/**
 * Wrap the library page in this provider. The provider also hydrates
 * `canWrite` from the parent's `canManage` boolean and keeps the
 * store in sync.
 */
export function MediaSelectionProvider({
  canWrite,
  children,
}: {
  canWrite: boolean;
  children: React.ReactNode;
}) {
  // Lazy-init via `useState` so the ref-equivalent is created on first
  // render and survives re-renders without us accessing `.current`
  // during render (which the react-hooks/refs lint forbids).
  const [store] = React.useState<MediaSelectionStore>(() => new MediaSelectionStore());
  React.useEffect(() => {
    store.setCanWrite(canWrite);
  }, [canWrite, store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

const NOOP_API: MediaSelectionApi = {
  state: { selected: EMPTY, lastClickedId: null, canWrite: false },
  toggle: () => undefined,
  toggleRange: () => undefined,
  setMany: () => undefined,
  clear: () => undefined,
  isSelected: () => false,
};

/** Subscribe to the media selection store from any client component. */
export function useMediaSelection(): MediaSelectionApi {
  const store = React.useContext(StoreContext);
  // Always call the hook so the rules-of-hooks lint doesn't fire when
  // we fall back to the no-op API. The store is never `null` here
  // because the Provider always supplies one — the conditional only
  // covers unit tests that mount components without a provider.
  const state = React.useSyncExternalStore(
    store ? store.subscribe : () => () => undefined,
    store ? store.getState : () => NOOP_API.state,
    store ? store.getState : () => NOOP_API.state,
  );
  if (!store) return NOOP_API;
  // Bind the methods so callers can destructure them off the API
  // object without losing `this`. (Destructuring a class method off
  // an object rebinds `this` to `undefined` under strict mode, which
  // is what the unit tests run in.)
  return {
    state,
    toggle: store.toggle.bind(store),
    toggleRange: store.toggleRange.bind(store),
    setMany: store.setMany.bind(store),
    clear: store.clear.bind(store),
    isSelected: (assetId: string) => state.selected.has(assetId),
  };
}

/** Export the store class for unit tests that instantiate the store directly. */
export const MediaSelectionStoreImpl = MediaSelectionStore;
