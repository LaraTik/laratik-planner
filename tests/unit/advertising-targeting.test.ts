import { describe, expect, it } from "vitest";
import { normalizeTargeting } from "@/lib/advertising/targeting";

describe("advertising targeting normalization", () => {
  it("turns provider targeting into bounded readable groups and preserves unknown fields", () => {
    const normalized = normalizeTargeting({
      age_min: 25,
      age_max: 44,
      genders: [1, 2],
      geo_locations: { countries: ["DE", "AT"] },
      publisher_platforms: ["facebook", "instagram"],
      flexible_spec: [{ interests: [{ name: "Photography" }] }],
      custom_field: { value: "provider-specific" },
    });

    expect(normalized.groups).toEqual([
      { key: "age", values: ["25", "44"], truncated: false },
      { key: "gender", values: ["1", "2"], truncated: false },
      { key: "locations", values: ["countries: DE", "countries: AT"], truncated: false },
      { key: "placements", values: ["facebook", "instagram"], truncated: false },
      { key: "audience", values: ["interests: Photography"], truncated: false },
    ]);
    expect(normalized.unknown).toEqual(["custom_field: value: provider-specific"]);
    expect(normalized.raw).toMatchObject({
      age_min: 25,
      custom_field: { value: "provider-specific" },
    });
  });

  it("returns an explicit empty state for unavailable or malformed targeting", () => {
    expect(normalizeTargeting(null)).toEqual({ groups: [], unknown: [], raw: null });
    expect(normalizeTargeting(["DE"])).toEqual({ groups: [], unknown: [], raw: null });
  });

  it("caps long provider arrays while retaining a disclosure flag", () => {
    const normalized = normalizeTargeting({
      interests: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
    });
    expect(normalized.groups).toEqual([
      { key: "audience", values: ["a", "b", "c", "d", "e", "f", "g", "h"], truncated: true },
    ]);
  });
});
