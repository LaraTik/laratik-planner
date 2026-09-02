import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(process.cwd(), "src/messages");

for (const locale of ["en", "ar"]) {
  const directory = join(root, locale);
  const sourcePath = join(directory, "common.json");
  const candidate = existsSync(sourcePath) ? JSON.parse(readFileSync(sourcePath, "utf8")) : null;
  const source =
    candidate && candidate.common && candidate.navigation
      ? candidate
      : Object.fromEntries(
          readdirSync(directory)
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => [
              entry.slice(0, -5),
              JSON.parse(readFileSync(join(directory, entry), "utf8")),
            ]),
        );
  if (!source.common) {
    const legacy = execFileSync("git", ["show", `HEAD:src/messages/${locale}/common.json`], {
      encoding: "utf8",
    });
    source.common = JSON.parse(legacy).common;
  }
  const namespaces = Object.keys(source);

  mkdirSync(directory, { recursive: true });
  const imports = namespaces.map((namespace) => `import ${namespace} from "./${namespace}.json";`);
  const exportEntries = namespaces.map((namespace) => `  ${namespace},`).join("\n");

  for (const namespace of namespaces) {
    writeFileSync(
      join(directory, `${namespace}.json`),
      `${JSON.stringify(source[namespace], null, 2)}\n`,
      "utf8",
    );
  }
  writeFileSync(
    join(directory, "index.ts"),
    `${imports.join("\n")}\n\nexport default {\n${exportEntries}\n} as const;\n`,
    "utf8",
  );
}
