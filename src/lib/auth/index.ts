/**
 * NextAuth v5 configuration — fully wired in Goal 2.
 *
 * Goal 0 leaves this as a typed stub so `pnpm typecheck` passes and the
 * `next-auth` import is validated. Goal 2 fills in:
 *  - Google OAuth provider
 *  - Resend / Nodemailer magic-link email provider
 *  - Drizzle adapter
 *  - JWT session strategy + role callback
 *  - Bootstrap token gate for the first administrator
 */
import "server-only";

export const authConfigPlaceholder = true;
