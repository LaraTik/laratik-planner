import { type DefaultSession } from "next-auth";

/**
 * Augment NextAuth's Session type with our app-specific fields.
 * The `id` is the users.id; `role` is the application-level role
 * (we use workspace-role for the actual authorization checks via
 * src/lib/auth/policy.ts).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

export {};
