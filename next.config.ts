import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small (~150 MB).
  // We copy the .next/standalone tree into the Docker runner stage.
  output: "standalone",

  // Long isolated browser suites compile many routes in one dev process. On
  // large test hosts, the default 80% heap restart can interrupt a browser
  // navigation mid-test. Keep Next's safety restart enabled by default; allow
  // an explicit E2E-only opt-in when the runner has enough memory to finish
  // the matrix without recycling the server.
  experimental: {
    devMemoryThresholdRestart: process.env.LARATIK_E2E_DISABLE_DEV_MEMORY_RESTART !== "1",
    // Bound production-build parallelism on memory-limited Docker/CI builders.
    cpus: 2,
  },

  // Native modules that must not be bundled by webpack.
  // argon2 / node-rs bindings in production; pg is pure-JS so it's fine.
  serverExternalPackages: ["@node-rs/argon2", "pg"],

  // Remote image sources we trust.
  //
  // These are the provider CDNs that serve post preview images:
  //   scontent.*.fbcdn.net / lookaside.fbsbx.com — Meta CDN media and thumbs
  //   *.fbcdn.net                                — Meta CDN, other shard hosts
  //   *.ttcdn.com / *.tiktokcdn.com              — TikTok CDN (not yet written)
  //
  // Scoped to the CDN hosts rather than opened up wholesale, so a thumbnail
  // URL from a provider response cannot be used to fetch an arbitrary origin.
  // Protocol is pinned to https, matching the
  // `social_post_observation_thumbnail_https` CHECK constraint.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.fbsbx.com" },
      { protocol: "https", hostname: "**.ttcdn.com" },
      { protocol: "https", hostname: "**.tiktokcdn.com" },
    ],
  },

  // Strict React in dev, no surprises in prod.
  reactStrictMode: true,

  // Keep the floating Next.js dev-tools badge out of the mobile bottom-nav
  // touch area during browser checks. Compile and runtime errors still surface.
  devIndicators: false,

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
