import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

type ModuleEdge = { importer: string; target: string };

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function resolveSourceModule(importer: string, specifier: string): string | null {
  const candidate = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : null;
  if (!candidate) return null;

  const paths = extname(candidate)
    ? [candidate]
    : [
        candidate,
        ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"].map(
          (extension) => `${candidate}${extension}`,
        ),
        ...["index.ts", "index.tsx", "index.mts", "index.cts", "index.js", "index.jsx"].map(
          (name) => join(candidate, name),
        ),
      ];
  return (
    paths.find(
      (path) => existsSync(path) && statSync(path).isFile() && path.startsWith(`${SRC}${sep}`),
    ) ?? null
  );
}

function moduleEdges(files: string[]): ModuleEdge[] {
  const edges: ModuleEdge[] = [];
  for (const importer of files) {
    const source = ts.createSourceFile(
      importer,
      readFileSync(importer, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      importer.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const add = (specifier: string) => {
      const target = resolveSourceModule(importer, specifier);
      if (target) edges.push({ importer, target });
    };

    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        add(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(node.arguments[0].text);
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        add(node.argument.literal.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return edges;
}

function featureFor(path: string): string | null {
  const srcPath = relative(SRC, path).split(sep);
  return srcPath[0] === "features" ? (srcPath[1] ?? null) : null;
}

function isPublicFeatureEntry(path: string): boolean {
  const name = path.split(sep).at(-1) ?? "";
  return /^index\.[cm]?[jt]sx?$/.test(name) || /^server\.[cm]?[jt]sx?$/.test(name);
}

function ownershipViolations(edges: ModuleEdge[]): string[] {
  const violations: string[] = [];
  for (const { importer, target } of edges) {
    const from = relative(SRC, importer).split(sep);
    const to = relative(SRC, target).split(sep);
    const fromLayer = from[0];
    const toLayer = to[0];
    const sourceFeature = featureFor(importer);
    const targetFeature = featureFor(target);
    let reason: string | null = null;

    if (fromLayer === "app" && toLayer === "lib" && to[1] === "media" && to[2] === "service.ts") {
      reason = "media app routes must use the media feature server entry point";
    } else if (fromLayer === "app" && targetFeature && !isPublicFeatureEntry(target)) {
      reason = "app routes may import only a feature's index.ts or server.ts entry";
    } else if (sourceFeature && toLayer === "app") {
      reason = "features must not import route modules";
    } else if (
      sourceFeature &&
      targetFeature &&
      sourceFeature !== targetFeature &&
      !isPublicFeatureEntry(target)
    ) {
      reason = "cross-feature imports must use the target feature's index.ts or server.ts entry";
    } else if ((fromLayer === "lib" || fromLayer === "components") && targetFeature) {
      reason = "platform and shared presentation modules must not depend on feature modules";
    }

    if (reason) {
      violations.push(`${relative(ROOT, importer)} -> ${relative(ROOT, target)}: ${reason}`);
    }
  }
  return violations;
}

describe("module ownership imports", () => {
  it("allows only documented feature entry points across feature seams", () => {
    const target = join(SRC, "features", "trends");
    expect(isPublicFeatureEntry(join(target, "index.ts"))).toBe(true);
    expect(isPublicFeatureEntry(join(target, "server.ts"))).toBe(true);
    expect(isPublicFeatureEntry(join(target, "source-catalog.ts"))).toBe(false);
  });

  it("enforces feature entry points and prevents feature dependencies from reversing direction", () => {
    expect(ownershipViolations(moduleEdges(walk(SRC)))).toEqual([]);
  });

  it("keeps feature index entries client-safe and marks server entries explicitly", () => {
    const featureDirectories = readdirSync(join(SRC, "features"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(SRC, "features", entry.name));

    for (const featureDirectory of featureDirectories) {
      const indexPath = join(featureDirectory, "index.ts");
      if (existsSync(indexPath)) {
        const indexText = readFileSync(indexPath, "utf8");
        expect(indexText, `${relative(SRC, indexPath)} should stay client-safe`).not.toContain(
          "server-only",
        );
        expect(
          moduleEdges([indexPath]).some(
            (edge) => edge.target === join(featureDirectory, "server.ts"),
          ),
          `${relative(SRC, indexPath)} must not re-export server code`,
        ).toBe(false);
      }

      const serverPath = join(featureDirectory, "server.ts");
      if (existsSync(serverPath)) {
        expect(
          readFileSync(serverPath, "utf8"),
          `${relative(SRC, serverPath)} should mark its seam`,
        ).toMatch(/import ["']server-only["'];?/);
      }
    }
  });
});
