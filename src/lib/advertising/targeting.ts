export type TargetingGroupKey =
  "age" | "gender" | "locations" | "languages" | "placements" | "audience" | "exclusions";

export type NormalizedTargetingGroup = {
  key: TargetingGroupKey;
  values: string[];
  truncated: boolean;
};

export type NormalizedTargeting = {
  groups: NormalizedTargetingGroup[];
  unknown: string[];
  raw: Record<string, unknown> | null;
};

const MAX_VALUES_PER_GROUP = 8;

const FIELD_GROUPS: Record<string, TargetingGroupKey> = {
  age_min: "age",
  age_max: "age",
  gender: "gender",
  genders: "gender",
  geo_locations: "locations",
  locations: "locations",
  locales: "languages",
  languages: "languages",
  device_platforms: "placements",
  facebook_positions: "placements",
  instagram_positions: "placements",
  publisher_platforms: "placements",
  behaviors: "audience",
  flexible_spec: "audience",
  interests: "audience",
  exclusions: "exclusions",
  excluded_custom_audiences: "exclusions",
};

export function normalizeTargeting(value: unknown): NormalizedTargeting {
  if (!isRecord(value)) return { groups: [], unknown: [], raw: null };

  const grouped = new Map<TargetingGroupKey, string[]>();
  const unknown: string[] = [];
  for (const [field, entry] of Object.entries(value)) {
    const group = FIELD_GROUPS[field.toLowerCase()];
    const values = flattenTargetingValue(entry);
    if (!group) {
      unknown.push(`${field}: ${values.join(", ") || "—"}`);
      continue;
    }
    grouped.set(group, [...(grouped.get(group) ?? []), ...values]);
  }

  const groups = [...grouped.entries()]
    .map(([key, values]) => {
      const unique = [...new Set(values.filter(Boolean))];
      return {
        key,
        values: unique.slice(0, MAX_VALUES_PER_GROUP),
        truncated: unique.length > MAX_VALUES_PER_GROUP,
      };
    })
    .filter((group) => group.values.length > 0);

  return { groups, unknown, raw: value };
}

function flattenTargetingValue(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(flattenTargetingValue);
  if (!isRecord(value)) return [];

  const preferred = ["name", "title", "label", "key", "id"].find(
    (key) => typeof value[key] === "string" || typeof value[key] === "number",
  );
  if (preferred) return [String(value[preferred])];

  return Object.entries(value).flatMap(([key, entry]) => {
    const values = flattenTargetingValue(entry);
    return values.map((item) => `${key}: ${item}`);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
