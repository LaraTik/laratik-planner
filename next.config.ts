import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small (~150 MB).
  // We copy the .next/standalone tree into the Docker runner stage.
  output: "standalone",

  // Native modules that must not be bundled by webpack.
  // argon2 / node-rs bindings in production; pg is pure-JS so it's fine.
  serverExternalPackages: ["@node-rs/argon2", "pg"],

  // Allow remote image sources we trust (none for v1, left empty intentionally).
  images: {
    remotePatterns: [],
  },

  // Strict React in dev, no surprises in prod.
  reactStrictMode: true,

  // Disable powered-by header (Traefik already adds its own).
  poweredByHeader: false,

  async redirects() {
    return [
      {
        source: "/app/platform/admins",
        destination: "/app/platform/access",
        permanent: true,
      },
    ];
  },

  async headers() {
    const environment =
      process.env.NODE_ENV === "production"
        ? "production"
        : process.env.NODE_ENV === "test"
          ? "test"
          : "development";
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(environment),
      },
    ];
  },

  // Standalone output omits some transitive deps that the server actually
  // needs at runtime. Force-include them in the file trace.
  outputFileTracingIncludes: {
    "**": ["./node_modules/@swc/helpers/**/*", "./node_modules/@next/swc-*/**/*"],
  },
};

export default withSentryConfig(nextConfig, {
  ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
  ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
  ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),
  silent: !process.env.CI,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  webpack: { treeshake: { removeDebugLogging: true } },
});
