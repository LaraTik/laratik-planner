import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Per-agency Meta callback route — `/api/social/meta/callback/[agencySlug]`.
 *
 * The two security-critical guarantees:
 *
 *   1. The agencySlug in the URL must resolve to a real agency.
 *      A bogus slug returns 404 before any state is touched.
 *
 *   2. The state's `workspaceId` must belong to the agency the
 *      URL names. A state row from a different agency is
 *      rejected as `invalid_state`. This is the defense-in-depth
 *      on top of the single-use state token.
 *
 * The happy-path code-exchange (Meta → short → long → pages →
 * pending connection) is already covered by the existing
 * `social-meta-provider.test.ts` / repo integration tests; here
 * we pin the per-agency routing only.
 */

const clientEnvMock = vi.hoisted(() => ({ NEXT_PUBLIC_APP_URL: "https://planner.laratik.com" }));
const agencySelectMock = vi.fn();
const consumeOauthStateMock = vi.fn();
const createPendingConnectionMock = vi.fn();
const getAgencyProviderConfigMock = vi.fn();
const exchangeMetaCodeForShortLivedTokenMock = vi.fn();
const exchangeShortLivedForLongLivedTokenMock = vi.fn();
const discoverMetaPagesMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("@/lib/validation/env", () => ({ clientEnv: clientEnvMock }));
vi.mock("@/lib/db", () => ({
  db: {
    select: agencySelectMock,
  },
}));
vi.mock("@/lib/social/repository", () => ({
  consumeOauthState: consumeOauthStateMock,
  createPendingConnection: createPendingConnectionMock,
}));
vi.mock("@/lib/social/provider-config", () => ({
  getAgencyProviderConfig: getAgencyProviderConfigMock,
}));
vi.mock("@/lib/social/providers/meta", () => ({
  exchangeMetaCodeForShortLivedToken: exchangeMetaCodeForShortLivedTokenMock,
  exchangeShortLivedForLongLivedToken: exchangeShortLivedForLongLivedTokenMock,
  discoverMetaPages: discoverMetaPagesMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/social/meta/callback/[agencySlug]/route");
}

function makeRequest(slug: string, code: string, state: string): NextRequest {
  return new NextRequest(
    `https://planner.laratik.com/api/social/meta/callback/${slug}?code=${code}&state=${state}`,
  );
}

beforeEach(() => {
  clientEnvMock.NEXT_PUBLIC_APP_URL = "https://planner.laratik.com";
  agencySelectMock.mockReset();
  consumeOauthStateMock.mockReset();
  createPendingConnectionMock.mockReset();
  getAgencyProviderConfigMock.mockReset();
  exchangeMetaCodeForShortLivedTokenMock.mockReset();
  exchangeShortLivedForLongLivedTokenMock.mockReset();
  discoverMetaPagesMock.mockReset();
  revalidatePathMock.mockReset();

  // Default: agency slug resolves to agency-1.
  agencySelectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "agency-1" }]),
      }),
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/social/meta/callback/[agencySlug] — agency routing", () => {
  it("returns 400 when the slug does not match the safe pattern", async () => {
    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bad_Slug", "code", "state"), {
      params: Promise.resolve({ agencySlug: "Bad_Slug" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid agency slug");
  });

  it("returns 404 when the agency does not exist", async () => {
    agencySelectMock.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
    const { GET } = await loadRoute();
    const res = await GET(makeRequest("ghost-agency", "code", "state"), {
      params: Promise.resolve({ agencySlug: "ghost-agency" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unknown agency");
  });

  it("rejects a state row from a different agency (cross-tenant defense)", async () => {
    // The URL names agency-1, but the state row's workspaceId
    // belongs to agency-2. The route must reject the request
    // before any Meta exchange — the per-agency URL is the new
    // defense-in-depth on top of the state token.
    consumeOauthStateMock.mockResolvedValueOnce({
      id: "state-1",
      stateDigest: "digest",
      provider: "meta",
      workspaceId: "ws-in-agency-2",
      actorId: "user-1",
      returnPath: "/app/w/acme/channels",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    const { GET } = await loadRoute();
    const res = await GET(makeRequest("acme", "code", "state"), {
      params: Promise.resolve({ agencySlug: "acme" }),
    });
    // The route redirects to the state's returnPath with
    // `meta_error=invalid_state` so the picker surfaces the same
    // friendly error as a missing/expired state.
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/app/w/acme/channels");
    expect(location).toContain("meta_error=invalid_state");
    // The downstream Meta exchange must NOT have been called.
    expect(exchangeMetaCodeForShortLivedTokenMock).not.toHaveBeenCalled();
  });
});
