#!/usr/bin/env tsx
/**
 * scripts/refactor-dir-arrows.ts
 *
 * Replace inline Lucide ArrowLeft/ArrowRight/ChevronLeft/ChevronRight
 * usages with the dir-aware wrappers in
 * `src/components/ui/dir-aware-icon.tsx`. The wrappers carry the
 * `rtl:rotate-180` rule so the icon mirrors correctly when the
 * document `dir` is `rtl`.
 *
 * The script is idempotent: re-running it after a successful pass
 * touches nothing because the ArrowLeft/Right/ChevronLeft/Right JSX
 * names are already gone.
 *
 * Usage:
 *   pnpm tsx scripts/refactor-dir-arrows.ts [glob...]
 *
 * Default glob: `src/**\/*.tsx`
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const TARGET_GLOBS = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];

type Replacement = {
  find: RegExp;
  replace: string;
};

const REPLACEMENTS: Replacement[] = [
  { find: /<ArrowLeft(\s)/g, replace: "<DirAwareArrowLeft$1" },
  { find: /<ArrowLeft(\s*\/>)/g, replace: "<DirAwareArrowLeft$1" },
  { find: /<\/ArrowLeft>/g, replace: "</DirAwareArrowLeft>" },
  { find: /<ArrowRight(\s)/g, replace: "<DirAwareArrowRight$1" },
  { find: /<ArrowRight(\s*\/>)/g, replace: "<DirAwareArrowRight$1" },
  { find: /<\/ArrowRight>/g, replace: "</DirAwareArrowRight>" },
  { find: /<ChevronLeft(\s)/g, replace: "<DirAwareChevronLeft$1" },
  { find: /<ChevronLeft(\s*\/>)/g, replace: "<DirAwareChevronLeft$1" },
  { find: /<\/ChevronLeft>/g, replace: "</DirAwareChevronLeft>" },
  { find: /<ChevronRight(\s)/g, replace: "<DirAwareChevronRight$1" },
  { find: /<ChevronRight(\s*\/>)/g, replace: "<DirAwareChevronRight$1" },
  { find: /<\/ChevronRight>/g, replace: "</DirAwareChevronRight>" },
];

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir)) {
    const p = join(dir, entry);
    const s = await stat(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) {
        continue;
      }
      yield* walk(p);
    } else if (p.endsWith(".tsx")) {
      yield p;
    }
  }
}

async function processFile(path: string): Promise<{ changed: boolean; count: number }> {
  const original = await readFile(path, "utf8");
  let next = original;
  let count = 0;
  for (const { find, replace } of REPLACEMENTS) {
    next = next.replace(find, () => {
      count += 1;
      return replace;
    });
  }
  if (count > 0) {
    // Update the import statement: drop the now-unused Lucide names
    // and add the new DirAware components from the helper file.
    next = updateImports(next);
    await writeFile(path, next, "utf8");
  }
  return { changed: count > 0, count };
}

function updateImports(src: string): string {
  // Find all `import { ... } from "lucide-react"` imports and
  // rewrite them: remove ArrowLeft/Right/ChevronLeft/Right, add
  // the DirAware component imports from our helper.
  const lucideImport = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["'];?/g;
  let m: RegExpExecArray | null;
  let result = src;
  while ((m = lucideImport.exec(src)) !== null) {
    const fullImport = m[0];
    const inner = m[1] ?? "";
    const names = inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const kept: string[] = [];
    const removed = new Set<string>();
    for (const n of names) {
      // keep "Foo as Bar" — only exact names
      if (n === "ArrowLeft" || n === "ArrowRight" || n === "ChevronLeft" || n === "ChevronRight") {
        removed.add(n);
      } else {
        kept.push(n);
      }
    }
    if (removed.size === 0) continue;
    const replaced =
      kept.length > 0 ? `import {\n  ${kept.join(",\n  ")},\n} from "lucide-react";` : "";
    // Compute which DirAware components to add from the wrapper file
    const wrapperImports: string[] = [];
    if (removed.has("ArrowLeft")) wrapperImports.push("DirAwareArrowLeft");
    if (removed.has("ArrowRight")) wrapperImports.push("DirAwareArrowRight");
    if (removed.has("ChevronLeft")) wrapperImports.push("DirAwareChevronLeft");
    if (removed.has("ChevronRight")) wrapperImports.push("DirAwareChevronRight");
    const helperImport = `import { ${wrapperImports.join(", ")} } from "@/components/ui/dir-aware-icon";`;
    const replacement = `${replaced}\n${helperImport}`;
    result = result.replace(fullImport, replacement);
  }
  return result;
}

async function main() {
  let totalChanged = 0;
  let totalReplacements = 0;
  const changedFiles: string[] = [];
  for (const target of TARGET_GLOBS) {
    const abs = join(ROOT, target);
    try {
      const s = await stat(abs);
      if (s.isDirectory()) {
        for await (const file of walk(abs)) {
          const { changed, count } = await processFile(file);
          if (changed) {
            totalChanged += 1;
            totalReplacements += count;
            changedFiles.push(relative(ROOT, file));
          }
        }
      }
    } catch {
      // skip
    }
  }
  console.log(`Refactored ${totalReplacements} usages in ${totalChanged} files:`);
  for (const f of changedFiles) {
    console.log(`  ${f.split(sep).join("/")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
