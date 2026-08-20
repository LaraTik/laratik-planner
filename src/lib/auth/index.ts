/**
 * Auth module re-exports. The real NextAuth config lives in `./config.ts`.
 *
 * Goal 0 left this file as a typed stub so `pnpm typecheck` passed before
 * the auth surface was wired. Goal 2 filled in `./config.ts` and this file
 * is now a thin re-export of the symbols other modules actually import.
 */
export { authConfig, handlers, signIn, signOut, auth } from "@/lib/auth/config";
