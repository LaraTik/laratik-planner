import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";

/**
 * NextAuth v5 configuration.
 *
 * Providers:
 *  - Google OAuth (production-grade, used by most agency staff)
 *  - Nodemailer magic link via Mailcow (passwordless fallback)
 *
 * Session strategy: JWT (master prompt §4). No DB session reads on every
 * request — the role + user.id are baked into the token at sign-in and
 * refreshed on each call to `auth()`.
 *
 * The Drizzle adapter handles user/account/verificationToken CRUD; for
 * JWT sessions, the `sessions` table is unused.
 */
export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  // Trust the host header when behind Traefik (AUTH_TRUST_HOST=true in prod)
  trustHost: serverEnv.AUTH_TRUST_HOST,

  providers: [
    ...(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: serverEnv.GOOGLE_CLIENT_ID,
            clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
            // Do not link accounts solely because an untrusted provider returns the
            // same email. Existing users sign in through their already-linked method.
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
    ...(serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASSWORD && serverEnv.SMTP_FROM
      ? [
          Nodemailer({
            server: {
              host: serverEnv.SMTP_HOST,
              port: serverEnv.SMTP_PORT,
              ...(serverEnv.SMTP_USER && serverEnv.SMTP_PASSWORD
                ? { auth: { user: serverEnv.SMTP_USER, pass: serverEnv.SMTP_PASSWORD } }
                : {}),
            },
            from: serverEnv.SMTP_FROM,
          }),
        ]
      : []),
  ] as NextAuthConfig["providers"],

  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 /* 30 days */ },

  pages: {
    signIn: "/signin",
    error: "/signin",
    verifyRequest: "/signin/verify",
    // NextAuth v5 redirects a brand-new user (no DB row yet) here on the
    // first sign-in. Pointed at /setup, which is the first-time-admin
    // bootstrap page. /setup's own logic redirects to /app once an
    // agency exists, so this is safe for invited users too — only the
    // very first user sees the bootstrap form. Do NOT change this to a
    // non-existent path; NextAuth will issue a 404 to the new user.
    newUser: "/setup",
  },

  callbacks: {
    /**
     * Persist the user id + role into the JWT on first sign-in. On
     * subsequent calls the token is decoded directly from the cookie.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        // role defaults to "user" on first sign-in; promoted to "agency_admin"
        // by the bootstrap flow (see src/lib/auth/bootstrap.ts) or by an
        // existing admin via the User Management UI (Goal 4).
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },

    async session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      return session;
    },

    /**
     * Authorization gate. Returning `false` redirects to /signin?error=AccessDenied.
     * Used by route handlers / server actions that want a custom check.
     * For page-level gates, use `auth()` server-side in the page itself.
     */
    async authorized({ auth: session }) {
      // Default: any signed-in user is authorized. Specific routes can
      // override with middleware matchers in proxy.ts.
      return !!session?.user;
    },
  },

  events: {
    /**
     * On first sign-in, if no agency exists, the user becomes the first
     * admin via the bootstrap flow. This runs on the *next* request via
     * the sign-in page's post-signin redirect, not here (events can't
     * be async without side effects on the auth response).
     *
     * The actual bootstrap logic lives in src/lib/auth/bootstrap.ts and
     * is invoked from the sign-in page when the user has no agency.
     */
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
