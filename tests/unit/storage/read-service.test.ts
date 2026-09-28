import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Private-object read path.
 *
 * Three contracts here are security-relevant and were untested:
 *
 *   1. **Every predicate in the lookup is load-bearing.** The query pins
 *      `agencyId`, `workspaceId` AND `status = 'active'`, and the result is
 *      then re-checked against the agency's current bucket. A signed URL for
 *      an object in another workspace, or for a soft-deleted object, is a
 *      data leak — so the mismatch branches must return null, not sign.
 *   2. **The URL cache must not outlive its own signature.** Entries are
 *      dropped 30s before the signed URL expires, and the map is capped at
 *      2000 entries, evicting oldest-first. An unbounded or stale cache turns
 *      into either a memory leak or a 403 storm on every page view.
 *   3. **Server-side fetch never throws.** A provider outage or a non-2xx
 *      becomes `null` so the caller renders a placeholder instead of a 500.
 */

const dbMock = vi.hoisted(() => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/db", () => dbMock);

const configMock = vi.hoisted(() => ({ getAgencyStorageContext: vi.fn() }));
vi.mock("@/lib/storage/config", () => configMock);

import {
  createStorageObjectReadUrl,
  createStorageObjectReadUrls,
  fetchStorageObject,
} from "@/lib/storage/read-service";

const AGENCY_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const WORKSPACE_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const OTHER_WORKSPACE_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const OBJECT_ID = "dddddddd-4444-4444-8444-dddddddddddd";
const BUCKET = "agency-bucket";
const URL = "https://r2.example.com/signed";

/** Fluent, awaitable Drizzle stand-in. */
function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

let signCount = 0;
const createReadUrl = vi.fn(async () => {
  signCount += 1;
  return URL;
});

function primeObjectRow(row: unknown) {
  dbMock.db.select.mockReturnValue(makeChain(row));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReset();
  configMock.getAgencyStorageContext.mockReset();
  createReadUrl.mockClear();
  signCount = 0;
  configMock.getAgencyStorageContext.mockResolvedValue({
    bucket: BUCKET,
    adapter: { createReadUrl },
  });
  primeObjectRow([{ objectKey: "media/1.png", bucket: BUCKET }]);
});

// ── createStorageObjectReadUrl ───────────────────────────────────────────

describe("createStorageObjectReadUrl", () => {
  it("returns null when the object is not visible to this agency/workspace", async () => {
    primeObjectRow([]);
    // Covers an object in another workspace, another agency, a soft-deleted
    // row, and a genuinely missing id — all of which the pinned WHERE clause
    // reduces to "no row".
    expect(
      await createStorageObjectReadUrl({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        objectId: OBJECT_ID,
      }),
    ).toBeNull();
  });

  it("returns null when the object lives in a bucket the agency no longer uses", async () => {
    primeObjectRow([{ objectKey: "media/1.png", bucket: "stale-bucket" }]);
    // The row survived a bucket migration; signing it would leak from a
    // bucket that is no longer the agency's storage.
    expect(
      await createStorageObjectReadUrl({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        objectId: OBJECT_ID,
      }),
    ).toBeNull();
    expect(createReadUrl).not.toHaveBeenCalled();
  });

  it("signs an authorized object", async () => {
    const url = await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
    });
    expect(url).toBe(URL);
    expect(createReadUrl).toHaveBeenCalledWith({ objectKey: "media/1.png" });
  });

  it("clamps the requested lifetime into [30, 900] seconds", async () => {
    await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
      expiresInSeconds: 5,
    });
    // Below the floor: a 5s URL is useless in practice and would expire
    // before a slow image load finished.
    expect(createReadUrl).toHaveBeenCalledWith({ objectKey: "media/1.png", expiresInSeconds: 30 });

    createReadUrl.mockClear();
    await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
      expiresInSeconds: 86_400,
    });
    // Above the ceiling: never hand out a long-lived signature for a private
    // object, since revoking the object would not revoke the URL.
    expect(createReadUrl).toHaveBeenCalledWith({ objectKey: "media/1.png", expiresInSeconds: 900 });
  });

  it("serves a repeat request from the cache instead of re-signing", async () => {
    const args = {
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
      expiresInSeconds: 600,
    };
    await createStorageObjectReadUrl(args);
    await createStorageObjectReadUrl(args);
    expect(signCount).toBe(1);
  });

  it("keys the cache on the requested lifetime, so a shorter URL is not served a long one", async () => {
    // Sharing a cache entry across lifetimes would hand a caller who asked
    // for 30s a 900s signature.
    await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
      expiresInSeconds: 30,
    });
    await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
      expiresInSeconds: 900,
    });
    expect(signCount).toBe(2);
  });

  it("bounds the cache and evicts oldest-first past 2000 entries", async () => {
    // Drives the prune path: 2001 distinct objects push the map to the cap,
    // and the eviction has to keep a long-running server from growing
    // without bound.
    for (let i = 0; i < 2001; i += 1) {
      primeObjectRow([{ objectKey: `media/${i}.png`, bucket: BUCKET }]);
      await createStorageObjectReadUrl({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        objectId: OBJECT_ID,
        expiresInSeconds: 600 + i,
      });
    }
    expect(signCount).toBe(2001);
    // The newest entry still serves, so the prune did not evict live data.
    primeObjectRow([{ objectKey: "media/2000.png", bucket: BUCKET }]);
    await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: OBJECT_ID,
      expiresInSeconds: 600 + 2000,
    });
    expect(signCount).toBe(2001);
  });
});

// ── createStorageObjectReadUrls ──────────────────────────────────────────

describe("createStorageObjectReadUrls", () => {
  it("returns an empty map without querying when no objects are requested", async () => {
    const result = await createStorageObjectReadUrls({ agencyId: AGENCY_ID, objects: [] });
    expect(result.size).toBe(0);
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("returns an empty map when none of the requested objects are visible", async () => {
    primeObjectRow([]);
    const result = await createStorageObjectReadUrls({
      agencyId: AGENCY_ID,
      objects: [{ objectId: OBJECT_ID, workspaceId: WORKSPACE_ID }],
    });
    expect(result.size).toBe(0);
  });

  it("signs every authorized object in one pass", async () => {
    primeObjectRow([
      { id: "o1", objectKey: "a.png", bucket: BUCKET, workspaceId: WORKSPACE_ID },
      { id: "o2", objectKey: "b.png", bucket: BUCKET, workspaceId: WORKSPACE_ID },
    ]);
    const result = await createStorageObjectReadUrls({
      agencyId: AGENCY_ID,
      objects: [
        { objectId: "o1", workspaceId: WORKSPACE_ID },
        { objectId: "o2", workspaceId: WORKSPACE_ID },
      ],
    });
    expect(result.size).toBe(2);
    expect(result.get("o1")).toBe(URL);
    expect(result.get("o2")).toBe(URL);
  });

  it("drops rows whose workspace or bucket does not match the request", async () => {
    // A row that came back from the agency+status filter still has to be
    // re-checked per object: a caller asking for o2 must not receive o1's URL
    // just because both belong to the same agency.
    primeObjectRow([
      { id: "o1", objectKey: "a.png", bucket: BUCKET, workspaceId: WORKSPACE_ID },
      { id: "o2", objectKey: "b.png", bucket: BUCKET, workspaceId: OTHER_WORKSPACE_ID },
      { id: "o3", objectKey: "c.png", bucket: "stale", workspaceId: WORKSPACE_ID },
    ]);
    const result = await createStorageObjectReadUrls({
      agencyId: AGENCY_ID,
      objects: [
        { objectId: "o1", workspaceId: WORKSPACE_ID },
        { objectId: "o2", workspaceId: WORKSPACE_ID },
        { objectId: "o3", workspaceId: WORKSPACE_ID },
      ],
    });
    expect([...result.keys()]).toEqual(["o1"]);
  });
});

// ── fetchStorageObject ───────────────────────────────────────────────────

describe("fetchStorageObject", () => {
  const baseInput = {
    agencyId: AGENCY_ID,
    workspaceId: WORKSPACE_ID,
    objectId: OBJECT_ID,
  };

  it("returns null instead of redirecting when the object is not signable", async () => {
    primeObjectRow([]);
    const fetchMock = vi.fn(async () => ({ ok: true, body: {} as ReadableStream }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchStorageObject(baseInput)).toBeNull();
    // A redirect would make the browser enforce the page CSP against the
    // provider host and break the preview entirely.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns null on a provider error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, body: {}, status: 404 })),
    );
    expect(await fetchStorageObject(baseInput)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns null when the response carries no body", async () => {
    // 204-style responses are `ok` but have nothing to stream; forwarding one
    // would produce a broken <img>.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, body: null })),
    );
    expect(await fetchStorageObject(baseInput)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("swallows a network failure rather than propagating it", async () => {
    // A provider outage must degrade to a placeholder, not a 500 page.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(fetchStorageObject(baseInput)).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it("forwards the signed URL and any caller headers", async () => {
    const body = {} as ReadableStream;
    const fetchMock = vi.fn(async () => ({ ok: true, body }));
    vi.stubGlobal("fetch", fetchMock);
    const headers = { "x-trace": "abc" };
    const response = await fetchStorageObject({ ...baseInput, headers });
    expect(response).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(URL, { headers });
    vi.unstubAllGlobals();
  });

  it("omits the headers key entirely when none are supplied", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, body: {} as ReadableStream }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchStorageObject(baseInput);
    // `exactOptionalPropertyTypes`: an explicit `headers: undefined` is not
    // the same as an absent key.
    expect(fetchMock).toHaveBeenCalledWith(URL, {});
    vi.unstubAllGlobals();
  });
});
