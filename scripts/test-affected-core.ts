export type TestLayer = "unit" | "integration" | "browser";

export type BrowserSelection = {
  spec: string;
  projects?: string[];
  grep?: string;
};

export type TestOwnershipArea = {
  id: string;
  sourceGlobs: string[];
  unitFiles: string[];
  integrationFiles: string[];
  browser: BrowserSelection[];
};

export type TestOwnershipManifest = {
  unitSelection: {
    source: "vitest-related";
    directTest: "owned-files";
  };
  areas: TestOwnershipArea[];
  globalSourceGlobs: string[];
};

export type OwnershipTestFileContents = Readonly<Record<string, string>>;

export type AffectedClassification = {
  kind: "none" | "targeted" | "escalated";
  areaIds: string[];
  unitFiles: string[];
  integrationFiles: string[];
  browser: BrowserSelection[];
  runAllUnit: boolean;
  runAllIntegration: boolean;
  runAllBrowser: boolean;
  reason?: string;
  escalationReason?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

/** Convert the small, repository-local glob dialect to a path regexp. */
export function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*" && glob[index + 1] === "*") {
      index += 1;
      if (glob[index + 1] === "/") {
        source += "(?:.*\\/)?";
        index += 1;
      } else {
        source += ".*";
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(character ?? "");
    }
  }
  return new RegExp(`${source}$`);
}

function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

function areaOwnsTestFile(path: string, area: TestOwnershipArea): boolean {
  return (
    matchesAny(path, area.unitFiles) ||
    matchesAny(path, area.integrationFiles) ||
    area.browser.some((selection) => selection.spec === path)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueBrowserSelections(values: BrowserSelection[]): BrowserSelection[] {
  const seen = new Set<string>();
  return values.filter((selection) => {
    const key = JSON.stringify(selection);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDocumentationPath(path: string): boolean {
  return path.startsWith("docs/") || path.endsWith(".md") || path.endsWith(".mdx");
}

function isTestRelevantPath(path: string): boolean {
  return (
    path.startsWith("src/") ||
    path.startsWith("tests/") ||
    path.startsWith("scripts/") ||
    path.startsWith(".github/") ||
    path === "package.json" ||
    path === "pnpm-lock.yaml" ||
    path === "tsconfig.json" ||
    path === "next.config.ts" ||
    path === "playwright.config.ts" ||
    path.startsWith("vitest")
  );
}

export function classifyChangedFiles(
  changedFiles: string[],
  manifest: TestOwnershipManifest,
): AffectedClassification {
  const files = unique(changedFiles.filter(Boolean));
  if (files.length === 0 || files.every(isDocumentationPath)) {
    return {
      kind: "none",
      areaIds: [],
      unitFiles: [],
      integrationFiles: [],
      browser: [],
      runAllUnit: false,
      runAllIntegration: false,
      runAllBrowser: false,
      reason: "Only documentation files changed.",
    };
  }

  if (files.some((file) => matchesAny(file, manifest.globalSourceGlobs))) {
    return {
      kind: "escalated",
      areaIds: [],
      unitFiles: [],
      integrationFiles: [],
      browser: [],
      runAllUnit: true,
      runAllIntegration: true,
      runAllBrowser: true,
      escalationReason: "A global test or application path changed.",
    };
  }

  const matchedAreas = manifest.areas.filter((area) =>
    files.some((file) => matchesAny(file, area.sourceGlobs) || areaOwnsTestFile(file, area)),
  );
  const relevantFiles = files.filter(isTestRelevantPath);

  if (
    matchedAreas.length === 0 &&
    (relevantFiles.length > 0 || files.some((file) => !isDocumentationPath(file)))
  ) {
    return {
      kind: "escalated",
      areaIds: [],
      unitFiles: [],
      integrationFiles: [],
      browser: [],
      runAllUnit: true,
      runAllIntegration: true,
      runAllBrowser: true,
      escalationReason: "No ownership mapping exists for the changed code path.",
    };
  }

  return {
    kind: "targeted",
    areaIds: matchedAreas.map((area) => area.id),
    unitFiles: unique(matchedAreas.flatMap((area) => area.unitFiles)),
    integrationFiles: unique(matchedAreas.flatMap((area) => area.integrationFiles)),
    browser: uniqueBrowserSelections(matchedAreas.flatMap((area) => area.browser)),
    runAllUnit: false,
    runAllIntegration: false,
    runAllBrowser: false,
  };
}

/** Validate all test references before a runner starts a potentially long job. */
export function validateOwnershipManifest(
  manifest: TestOwnershipManifest,
  repositoryFiles: string[],
  testFileContents: OwnershipTestFileContents = {},
): string[] {
  const errors: string[] = [];
  const validProjects = new Set([
    "chromium",
    "firefox",
    "webkit",
    "mobile-chrome",
    "mobile-safari",
    "visual-chromium",
  ]);
  for (const area of manifest.areas) {
    const patterns = [
      ...area.unitFiles,
      ...area.integrationFiles,
      ...area.browser.map((selection) => selection.spec),
    ];
    for (const pattern of patterns) {
      if (!repositoryFiles.some((file) => matchesAny(file, [pattern]))) {
        const kind = area.unitFiles.includes(pattern)
          ? "unit"
          : area.integrationFiles.includes(pattern)
            ? "integration"
            : "browser";
        errors.push(
          `${area.id}: ${kind} file pattern does not match any repository file: ${pattern}`,
        );
      }
    }
    for (const selection of area.browser) {
      for (const project of selection.projects ?? []) {
        if (!validProjects.has(project)) {
          errors.push(
            `${area.id}: browser selection references unknown Playwright project: ${project}`,
          );
        }
      }
      if (selection.grep !== undefined && selection.grep.trim() === "") {
        errors.push(`${area.id}: browser selector has an empty grep pattern`);
      }
      const testFileContent = testFileContents[selection.spec];
      if (selection.grep && testFileContent !== undefined) {
        let selector: RegExp;
        try {
          selector = new RegExp(selection.grep, "i");
        } catch {
          errors.push(
            `${area.id}: browser grep is not valid regular expression: ${selection.grep}`,
          );
          continue;
        }
        if (!selector.test(testFileContent)) {
          errors.push(
            `${area.id}: browser grep does not match ${selection.spec}: ${selection.grep}`,
          );
        }
      }
    }
  }
  return errors;
}
