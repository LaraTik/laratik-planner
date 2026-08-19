import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Next.js cache revalidation so server-side service tests can run
// outside a Next request context.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}));
