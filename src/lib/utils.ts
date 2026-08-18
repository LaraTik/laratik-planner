import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui helper: combine class names with Tailwind-aware dedup. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
