import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { TREND_SOURCE_CATALOG } from "@/features/trends";

type SharedSourceFields = {
  key: string;
  tier: string;
  tos_class: string;
  default_cadence: string;
  requires_api_key: boolean;
};

const repoRoot = process.cwd();

function readPythonCatalog(): SharedSourceFields[] {
  const script = [
    "import importlib.util",
    "import json",
    "import sys",
    "spec = importlib.util.spec_from_file_location('trend_catalog', 'services/trends/app/extractor/catalog.py')",
    "catalog = importlib.util.module_from_spec(spec)",
    "sys.modules[spec.name] = catalog",
    "spec.loader.exec_module(catalog)",
    "fields = ('key', 'tier', 'tos_class', 'default_cadence', 'requires_api_key')",
    "print(json.dumps([{field: getattr(source, field) for field in fields} for source in catalog.SOURCES]))",
  ].join("\n");

  return JSON.parse(
    execFileSync("python3", ["-c", script], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
    }),
  ) as SharedSourceFields[];
}

describe("Trends catalog shared-field contract", () => {
  it("keeps the UI projection aligned with the Python source of truth", () => {
    const pythonSources = readPythonCatalog()
      .map((source) => ({
        key: source.key,
        tier: source.tier,
        tosClass: source.tos_class,
        cadence: source.default_cadence,
        requiresApiKey: source.requires_api_key,
      }))
      .sort((left, right) => left.key.localeCompare(right.key));

    const uiSources = TREND_SOURCE_CATALOG.map(
      ({ key, tier, tosClass, cadence, requiresApiKey }) => ({
        key,
        tier,
        tosClass,
        cadence,
        requiresApiKey,
      }),
    ).sort((left, right) => left.key.localeCompare(right.key));

    expect(uiSources).toEqual(pythonSources);
  });
});
