import type { NextConfig } from "next";

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

  // Standalone output omits some transitive deps that the server actually
  // needs at runtime. Force-include them in the file trace.
  outputFileTracingIncludes: {
    "**": ["./node_modules/@swc/helpers/**/*", "./node_modules/@next/swc-*/**/*"],
  },

  // Sentry is wired later (Goal 13). Skipped here to keep Goal 0 dependency-light.
  // Sentry: {} block belongs in the build phase.
};

export default nextConfig;
