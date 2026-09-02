"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * LinkifyText — render text with URLs turned into clickable
 * `<a>` tags. The list of surfaces that needed this is
 * long (caption previews, discussion comments, activity
 * entries, references fields, brief excerpts, etc.) and
 * the implementation is small, so this lives in `ui/`
 * rather than a feature folder.
 *
 * Contract:
 *   - Only `http://` and `https://` URLs are turned into
 *     links. `mailto:`, `tel:`, relative paths, and bare
 *     hostnames (`example.com` without a scheme) are NOT
 *     auto-linked — auto-linking those produces surprising
 *     results (e.g. `user@example.com` becomes a link) and
 *     we don't have a place to send `mailto:` to yet.
 *   - Trailing punctuation that's almost certainly not part
 *     of the URL (`.`, `,`, `)`, `]`, `!`, `?`, `;`,
 *     U+3002 Chinese period, Arabic comma U+060C) is
 *     stripped from the `href` but preserved in the text.
 *     This is the standard pragmatic approach (matches
 *     GitHub / Slack / Linear auto-link behaviour).
 *   - Links open in a new tab with `rel="noopener noreferrer
 *     nofollow"` so an untrusted caption can't navigate
 *     the top window. `nofollow` is a small SEO defence for
 *     user-generated content.
 *   - The link is wrapped in a `<span>` that styles it
 *     like a regular inline link (underlined, primary
 *     colour) and adds a focus ring for keyboard users.
 *   - The component is a pure render of segments; no
 *     internal state, no effects, safe in Server Components
 *     and on the server boundary. The `<a>` target/rel is
 *     statically safe.
 *
 * Not in scope: inline previews of the link target
 * (unfurl cards), tracking which links the user has
 * clicked, or any kind of "link warning" interstitial. A
 * future "external-link warning" pass can hang off the
 * same data the renderer produces.
 */

const TRAILING_PUNCTUATION = /[.,)\]!?;‏،。]+$/u;

/**
 * Match `http://` or `https://` URLs in plain text. The
 * pattern is intentionally conservative: no scheme-less
 * hostnames, no `ftp://`, no `file://`, no Markdown
 * autolinks. The character class is the smallest set that
 * matches what real users type (no spaces, no quotes, no
 * angle brackets).
 *
 * Tests pin this against a handful of real-world captions
 * and the GitHub / Slack autolink behaviour.
 */
const URL_REGEX = /https?:\/\/[^\s<>"'`\\)\]}+]+/gi;

export interface LinkifySegment {
  /** Either `"text"` or `"link"`. */
  type: "text" | "link";
  /** The literal text in the source. For links, this is
   *  the cleaned URL (without trailing punctuation). */
  value: string;
  /** The full `href` to use. Equal to `value` for
   *  untrimmed URLs; differs when trailing punctuation
   *  was stripped. */
  href: string;
  /** The original text including any trailing punctuation
   *  that was stripped from the `href`. The renderer
   *  places this after the link so the visible text is
   *  identical to the input. */
  trailing?: string;
}

export function linkifySegments(input: string): LinkifySegment[] {
  if (!input) return [];
  const out: LinkifySegment[] = [];
  let cursor = 0;
  // `URL_REGEX` is global; reset `lastIndex` per call.
  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(input)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > cursor) {
      out.push({
        type: "text",
        value: input.slice(cursor, start),
        href: input.slice(cursor, start),
      });
    }
    const raw = match[0];
    const trailingMatch = raw.match(TRAILING_PUNCTUATION);
    if (trailingMatch) {
      const trailing = trailingMatch[0];
      const href = raw.slice(0, raw.length - trailing.length);
      out.push({ type: "link", value: href, href, trailing });
    } else {
      out.push({ type: "link", value: raw, href: raw });
    }
    cursor = end;
  }
  if (cursor < input.length) {
    out.push({ type: "text", value: input.slice(cursor), href: input.slice(cursor) });
  }
  return out;
}

export interface LinkifyTextProps {
  /** The text to render. May contain multiple URLs. */
  children: string;
  /** Optional Tailwind additions applied to the wrapper. */
  className?: string;
  /**
   * The element used for the text segments. Defaults to
   * `<p>` when the caller passes `className` and the
   * `whitespace-pre-wrap` styling, otherwise `<span>` so
   * the component can be inlined inside a longer paragraph.
   * Always a `<span>` for link segments.
   */
  as?: "p" | "span" | "div";
  /**
   * Mark the link as a user-generated-content URL (the
   * default for caption / comment surfaces) so the
   * `rel` includes `nofollow`. Pass `false` for
   * internally-curated surfaces (e.g. a reference list
   * the workspace manager has vetted).
   */
  userGenerated?: boolean;
  /**
   * `data-testid` applied to the wrapper. The link
   * itself is tagged with `data-testid="linkify-link"`
   * for selection in tests.
   */
  testId?: string;
}

const LINK_CLASSES =
  // Primary colour + underline on hover matches the rest
  // of the app's "interactive text" pattern. The focus
  // ring is on the wrapper so the link itself doesn't
  // need extra keyboard plumbing.
  "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-none";

export function LinkifyText({
  children,
  className,
  as = "span",
  userGenerated = true,
  testId,
}: LinkifyTextProps) {
  const segments = React.useMemo(() => linkifySegments(children), [children]);
  if (segments.length === 0) {
    // Empty / whitespace input — return an empty element
    // so the caller's layout doesn't collapse on a missing
    // node. (Most callers render LinkifyText instead of a
    // raw `<p>`; collapsing would cause a layout shift.)
    return React.createElement(as, { className, "data-testid": testId }, null);
  }
  const Wrapper = as;
  const rel = userGenerated ? "noopener noreferrer nofollow" : "noopener noreferrer";
  return (
    <Wrapper
      className={cn("break-words", className)}
      data-testid={testId}
      // `whitespace-pre-wrap` is opt-in via `className` —
      // some surfaces want the default collapsing.
    >
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <React.Fragment key={i}>{seg.value}</React.Fragment>;
        }
        return (
          <React.Fragment key={i}>
            <a
              href={seg.href}
              target="_blank"
              rel={rel}
              className={LINK_CLASSES}
              data-testid="linkify-link"
            >
              {seg.value}
            </a>
            {seg.trailing}
          </React.Fragment>
        );
      })}
    </Wrapper>
  );
}
