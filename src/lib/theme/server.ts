import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { parseThemePreference, type ThemePreference } from "./preferences";

export async function getThemePreference(userId: string): Promise<ThemePreference> {
  const [row] = await db
    .select({ themePreference: users.themePreference })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return parseThemePreference(row?.themePreference) ?? "system";
}
