import { isAbsolute, relative, sep } from "node:path";

/** Pure guards and SQL helpers for the non-transactional index runner. */

export function isInsideDirectory(candidate: string, directory: string): boolean {
  const relativePath = relative(directory, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

export function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function stripLeadingComments(sql: string): string {
  let rest = sql.trimStart();
  while (rest.startsWith("--") || rest.startsWith("/*")) {
    if (rest.startsWith("--")) {
      const newline = rest.indexOf("\n");
      rest = newline === -1 ? "" : rest.slice(newline + 1).trimStart();
      continue;
    }
    const end = rest.indexOf("*/", 2);
    if (end === -1) return "";
    rest = rest.slice(end + 2).trimStart();
  }
  return rest;
}

function onlyCommentsAndWhitespace(sql: string): boolean {
  let i = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i]!)) {
      i += 1;
      continue;
    }
    if (sql.startsWith("--", i)) {
      const newline = sql.indexOf("\n", i + 2);
      i = newline === -1 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.startsWith("/*", i)) {
          depth += 1;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      if (depth !== 0) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** Return whether a breakpoint-delimited chunk contains only one SQL command. */
function isSingleSqlStatement(sql: string): boolean {
  let i = 0;
  let state: "normal" | "single" | "double" = "normal";
  let singleQuoteEscapesBackslash = false;
  let blockDepth = 0;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    if (dollarTag) {
      const end = sql.indexOf(dollarTag, i);
      if (end === -1) return false;
      i = end + dollarTag.length;
      dollarTag = null;
      continue;
    }
    if (blockDepth > 0) {
      if (sql.startsWith("/*", i)) {
        blockDepth += 1;
        i += 2;
      } else if (sql.startsWith("*/", i)) {
        blockDepth -= 1;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "single") {
      if (singleQuoteEscapesBackslash && sql[i] === "\\") {
        i += 2;
      } else if (sql.startsWith("''", i)) {
        i += 2;
      } else if (sql[i] === "'") {
        state = "normal";
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "double") {
      if (sql.startsWith('""', i)) {
        i += 2;
      } else if (sql[i] === '"') {
        state = "normal";
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (sql.startsWith("--", i)) {
      const newline = sql.indexOf("\n", i + 2);
      i = newline === -1 ? sql.length : newline + 1;
    } else if (sql.startsWith("/*", i)) {
      blockDepth = 1;
      i += 2;
    } else if (sql[i] === "'") {
      state = "single";
      const previous = sql[i - 1];
      const beforePrevious = sql[i - 2];
      singleQuoteEscapesBackslash =
        (previous === "e" || previous === "E") &&
        (beforePrevious === undefined || !/[A-Za-z0-9_$]/.test(beforePrevious));
      i += 1;
    } else if (sql[i] === '"') {
      state = "double";
      i += 1;
    } else if (sql[i] === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
      } else {
        i += 1;
      }
    } else if (sql[i] === ";") {
      return state === "normal" && onlyCommentsAndWhitespace(sql.slice(i + 1));
    } else {
      i += 1;
    }
  }

  return state === "normal" && blockDepth === 0 && dollarTag === null;
}

export function validateConcurrentIndexStatements(statements: readonly string[]): void {
  for (const [index, statement] of statements.entries()) {
    const command = stripLeadingComments(statement);
    const isConcurrentIndex = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(command);
    if (!isConcurrentIndex || !isSingleSqlStatement(command)) {
      throw new Error(
        `statement ${index + 1} must contain exactly one CREATE [UNIQUE] INDEX CONCURRENTLY command`,
      );
    }
  }
}

/** Extract an index name for the failure-path cleanup instruction. */
export function extractIndexName(statement: string): string | null {
  const command = stripLeadingComments(statement);
  const match = command.match(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i,
  );
  return match?.[1] ?? null;
}
