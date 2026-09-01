import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [absolute] : [];
  });
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ??
    null
  );
}

function clientBoundaryOffenders(): string[] {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    if (/^\s*["']use client["']/.test(source) || !source.includes("t={t}")) continue;

    const imports = [
      ...source.matchAll(/import\s+(?:\{([^}]+)\}|([\w]+))\s+from\s+["']([^"']+)["']/g),
    ];
    for (const match of imports) {
      const names = match[1]
        ? match[1].split(",").map(
            (name) =>
              name
                .trim()
                .split(/\s+as\s+/)
                .pop() ?? "",
          )
        : [match[2] ?? ""];
      const target = resolveImport(file, match[3] ?? "");
      if (!target) continue;
      const targetSource = fs.readFileSync(target, "utf8");
      if (!/^\s*["']use client["']/.test(targetSource)) continue;
      if (names.some((name) => new RegExp(`<${name}\\b[^>]*\\bt=\\{t\\}`).test(source))) {
        offenders.push(
          `${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), target)}`,
        );
      }
    }
  }
  return offenders;
}

describe("Server → Client translation boundaries", () => {
  it("never serializes a translator function from a Server Component", () => {
    expect(clientBoundaryOffenders()).toEqual([]);
  });
});
