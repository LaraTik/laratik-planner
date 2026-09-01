import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
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
    if (/^\s*["']use client["']/.test(source)) continue;
    const syntax = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const clientImports = new Map<string, string>();
    for (const statement of syntax.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const target = resolveImport(file, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (!target || !clause || !/^\s*["']use client["']/.test(fs.readFileSync(target, "utf8"))) {
        continue;
      }
      if (clause.name) clientImports.set(clause.name.text, target);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          clientImports.set(element.name.text, target);
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName;
        if (ts.isIdentifier(tag) && clientImports.has(tag.text)) {
          const hasTranslatorProp = opening.attributes.properties.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              ts.isIdentifier(attribute.name) &&
              attribute.name.text === "t" &&
              !!attribute.initializer &&
              ts.isJsxExpression(attribute.initializer) &&
              !!attribute.initializer.expression,
          );
          if (hasTranslatorProp) {
            offenders.push(
              `${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), clientImports.get(tag.text)!)}`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
  return offenders;
}

describe("Server → Client translation boundaries", () => {
  it("never serializes a translator function from a Server Component", () => {
    expect(clientBoundaryOffenders()).toEqual([]);
  });
});
