import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "next-env.d.ts",
    // Worktree directory contains its own checkout, build artifacts, and
    // node_modules — never lint it from the parent repo.
    ".worktrees/**",
    // Visual-regression snapshots are generated artifacts (absolute-path
    // filenames, OS-specific suffixes). Not source.
    "tests/e2e/visual-regression.spec.ts-snapshots/**",
  ]),
]);

export default eslintConfig;
