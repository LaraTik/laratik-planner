import { describe, expect, it } from "vitest";
import {
  classifyMetaDiagnostic,
  extractMetaSocialIdentities,
  hasMetaInstagramAccount,
} from "@/lib/advertising/meta-workflow";

describe("Meta advertising diagnostic mapping", () => {
  it("distinguishes expired credentials, permission, rate, and unavailable states", () => {
    expect(classifyMetaDiagnostic({ status: 401, code: 190 }).state).toBe("expired_or_revoked");
    expect(classifyMetaDiagnostic({ status: 403, code: 200 }).state).toBe("missing_permission");
    expect(classifyMetaDiagnostic({ status: 429 }).state).toBe("rate_limited");
    expect(classifyMetaDiagnostic({ status: 503 }).state).toBe("provider_temporarily_unavailable");
  });

  it("does not expose provider error text in the diagnostic contract", () => {
    const result = classifyMetaDiagnostic({
      status: 400,
      code: 100,
      message: "access_token=secret",
    });
    expect(result).toEqual({
      state: "unsupported_field",
      retryable: false,
      code: "meta_invalid_request",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("extracts only Page and linked Instagram identity fields", () => {
    const result = extractMetaSocialIdentities({
      data: [
        {
          id: "page-1",
          name: "Food Game",
          access_token: "must-not-persist",
          instagram_business_account: {
            id: "ig-1",
            username: "foodgame",
            name: "Food Game IG",
            access_token: "must-not-persist",
          },
        },
        { id: "page-2", name: "Page without Instagram" },
        { name: "invalid without id" },
      ],
    });
    expect(result).toEqual([
      {
        identityType: "facebook_page",
        externalIdentityId: "page-1",
        displayName: "Food Game",
        username: null,
        parentExternalIdentityId: null,
      },
      {
        identityType: "instagram_business",
        externalIdentityId: "ig-1",
        displayName: "Food Game IG",
        username: "foodgame",
        parentExternalIdentityId: "page-1",
      },
      {
        identityType: "facebook_page",
        externalIdentityId: "page-2",
        displayName: "Page without Instagram",
        username: null,
        parentExternalIdentityId: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("must-not-persist");
  });

  it("treats an unassigned Instagram professional account as optional no-data", () => {
    expect(hasMetaInstagramAccount({ id: "page-1" })).toBe(false);
    expect(hasMetaInstagramAccount({ instagram_business_account: { id: "ig-1" } })).toBe(true);
    expect(hasMetaInstagramAccount({ instagram_business_account: {} })).toBe(false);
  });
});
