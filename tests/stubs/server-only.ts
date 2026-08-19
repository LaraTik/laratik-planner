// Stub for the "server-only" package used by Next.js server modules.
// In the real Next.js build, importing this in a client bundle is a
// build error. For Vitest, we just want it to resolve as a no-op so
// the server modules can be tested in isolation.
export {};
