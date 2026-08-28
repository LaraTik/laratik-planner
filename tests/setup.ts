import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Next.js cache revalidation so server-side service tests can run
// outside a Next request context.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

// jsdom doesn't ship `ResizeObserver`; Radix UI primitives (including
// `@radix-ui/react-checkbox` and its transitive `react-use-size`)
// crash on import without it. Polyfill as a no-op so the jsdom test
// environment satisfies the type and the size hook can short-circuit.
// Production code is unaffected — this only runs under vitest + jsdom.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}
