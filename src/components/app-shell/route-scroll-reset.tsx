"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Keep route transitions from carrying a form's scroll position into the next screen. */
export function RouteScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}
