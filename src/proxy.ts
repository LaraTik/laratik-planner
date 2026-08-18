/**
 * Next.js proxy (renamed from middleware in Next.js 16) — auth gate added in Goal 2.
 *
 * Goal 0: pass-through proxy that proves the build pipeline works
 * end-to-end. Replaced in Goal 2 with a NextAuth v5 proxy that
 * protects /(app)/* routes and refreshes the session cookie.
 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  // Pass-through for Goal 0. Goal 2 replaces this with NextAuth v5
  // session refresh + (app)/* route protection.
  void req;
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
