import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * TEST-09 (current-actor) — direct unit coverage of
 * `src/lib/auth/current-actor.ts`.
 *
 * The audit (`tmp/full-review/test-gaps.md`, finding TEST-09) called
 * out that the `getCurrentActor` helper is referenced by name in
 * existing platform tests but never directly covered. The helper
 * bridges the NextAuth `Session` shape to the policy-shaped `Actor`.
 * A regression here (e.g. dropping the `user.id` check and returning
 * `{ id: undefined }`) cascades into every policy call downstream.
 *
 * Mock pattern: mock `@/lib/auth/config` to return a controllable
 * session shape per test.
 */

const sessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/config", () => ({
  auth: sessionMock,
}));

const { currentActor } = await import("@/lib/auth/current-actor");

beforeEach(() => {
  sessionMock.mockReset();
});

describe("currentActor", () => {
  it("returns an Actor { id } when the session has a user with an id", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const actor = await currentActor();
    expect(actor).toEqual({ id: "user-1" });
  });

  it("returns null when the session is null (signed out)", async () => {
    sessionMock.mockResolvedValue(null);
    const actor = await currentActor();
    expect(actor).toBeNull();
  });

  it("returns null when the session has no user", async () => {
    sessionMock.mockResolvedValue({});
    const actor = await currentActor();
    expect(actor).toBeNull();
  });

  it("returns null when the user has no id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const actor = await currentActor();
    expect(actor).toBeNull();
  });

  it("returns null when the user.id is an empty string (defensive)", async () => {
    sessionMock.mockResolvedValue({ user: { id: "" } });
    const actor = await currentActor();
    expect(actor).toBeNull();
  });
});
