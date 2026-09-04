import { vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

/**
 * Integration suites own their database reset in their local hooks. A shared
 * afterAll reset is intentionally avoided: Vitest can begin the next file
 * while a setup-file afterAll callback is still finishing, which lets a
 * destructive TRUNCATE overlap the next suite's fixture writes.
 */
