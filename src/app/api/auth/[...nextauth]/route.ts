import { handlers } from "@/lib/auth/config";

/**
 * NextAuth v5 catch-all route. Handles:
 *  - /api/auth/signin
 *  - /api/auth/signout
 *  - /api/auth/callback/:provider
 *  - /api/auth/session
 *  - /api/auth/csrf
 *  - /api/auth/providers
 *  - /api/auth/verify-request
 */
export const { GET, POST } = handlers;
