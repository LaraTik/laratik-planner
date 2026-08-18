import Link from "next/link";

/**
 * Goal 0 placeholder landing page.
 * Replaced by the real `(marketing)` route group in Goal 3 (app shell).
 *
 * Goal 0 only needs a visible "the app is up" surface so we can curl the
 * health endpoint + visit the page in the browser smoke test.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          Goal 0 · Production foundation
        </p>
        <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
          laratik-planner
        </h1>
        <p className="text-body text-fg-secondary max-w-prose">
          Social media planning, design, and approvals for one agency. Ported from the StudioFlow
          master prompt to a self-hosted Next.js + Drizzle + Postgres stack on the LaraTik VPS.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/api/health"
          className="border-border bg-surface text-body text-fg-primary hover:bg-surface-subtle rounded-[var(--radius-control)] border px-4 py-3 font-semibold transition"
        >
          Health endpoint →
        </Link>
        <a
          href="https://github.com/LaraTik/laratik-planner"
          className="border-border bg-surface text-body text-fg-primary hover:bg-surface-subtle rounded-[var(--radius-control)] border px-4 py-3 font-semibold transition"
        >
          Repository →
        </a>
      </div>

      <p className="text-label text-fg-muted">
        Next steps: see <code className="bg-surface-subtle rounded px-1.5 py-0.5">AGENTS.md</code>{" "}
        and{" "}
        <code className="bg-surface-subtle rounded px-1.5 py-0.5">
          docs/implementation/progress.md
        </code>
        .
      </p>
    </main>
  );
}
