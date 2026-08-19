import { expect } from "vitest";

export async function expectPgConstraint(operation: Promise<unknown>, constraint: string) {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL constraint ${constraint} to reject the operation`);
  } catch (error) {
    const details: string[] = [];
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
      const row = current as Record<string, unknown>;
      if (typeof row.message === "string") details.push(row.message);
      if (typeof row.constraint === "string") details.push(row.constraint);
      current = row.cause;
    }
    expect(details.join("\n")).toContain(constraint);
  }
}
