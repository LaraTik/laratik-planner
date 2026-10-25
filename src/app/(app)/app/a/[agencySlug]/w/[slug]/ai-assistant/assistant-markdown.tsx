"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <h2 className="text-title-section text-fg-primary mt-5 font-semibold first:mt-0" dir="auto">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="text-title-card text-fg-primary mt-4 font-semibold first:mt-0" dir="auto">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-body text-fg-primary mt-3 font-semibold" dir="auto">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-body leading-7 whitespace-pre-wrap" dir="auto">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="text-body list-disc space-y-1 ps-6" dir="auto">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="text-body list-decimal space-y-1 ps-6" dir="auto">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="ps-1" dir="auto">
      {children}
    </li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary focus-visible:ring-focus-ring underline underline-offset-2 focus-visible:ring-2"
      dir="auto"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="border-primary/40 text-fg-secondary space-y-2 border-s-2 ps-3"
      dir="auto"
    >
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre
      className="bg-surface-subtle text-fg-primary max-w-full overflow-x-auto rounded-[var(--radius-control)] p-3 text-sm"
      dir="ltr"
    >
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="bg-surface-subtle rounded px-1 py-0.5 font-mono text-[0.9em]" dir="ltr">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div
      className="border-border max-w-full overflow-x-auto rounded-[var(--radius-control)] border"
      dir="ltr"
    >
      <table className="text-body w-full border-collapse text-start" dir="auto">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-subtle">{children}</thead>,
  th: ({ children }) => (
    <th className="border-border border-b px-3 py-2 text-start font-semibold" dir="auto">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-border border-b px-3 py-2 align-top" dir="auto">
      {children}
    </td>
  ),
  img: ({ alt }) => <span className="text-label text-fg-muted">{alt}</span>,
  hr: () => <hr className="border-border my-4" />,
};

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-3 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
