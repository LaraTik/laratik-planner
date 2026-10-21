import { z } from "zod";

export function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(isValidIanaTimezone, "Unknown timezone");
