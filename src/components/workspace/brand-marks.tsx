/**
 * Official platform brand marks.
 *
 * `lucide-react` is the project's icon library, but its glyphs are
 * monochrome (`currentColor`) and its Instagram slot is a generic camera.
 * Neither can render "the official coloured logo", so the two brands that
 * actually appear in Command Center content are drawn here with their
 * published brand colours.
 *
 * Scope note: this is a deliberate, narrow exception to `design-system.md`
 * ("never add raw page-level colour values for routine UI", "colour is
 * reserved for actions, statuses, and data meaning"). A third-party brand
 * mark is identity, not UI chrome — a monochrome Instagram logo is simply
 * the wrong logo — and these values appear only inside the mark itself.
 * Nothing else on the page gains colour. Platforms without a mark here keep
 * their lucide glyph so the row still reads consistently.
 *
 * Both marks are `aria-hidden`: the accessible name always comes from
 * adjacent visible text, so a brand glyph must never announce itself
 * separately from the account name beside it.
 */

/** Instagram's published wordmark gradient stops, in logo order. */
const INSTAGRAM_GRADIENT_ID = "brand-mark-instagram-gradient";

export function InstagramMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-testid="brand-mark-instagram"
    >
      <defs>
        {/*
          The id is intentionally stable rather than per-instance: every
          instance renders the identical gradient, so the first definition in
          the document is the one referenced and the result is correct in all
          browsers. A unique id would need a client hook, and these render
          inside Server Components too.
        */}
        <linearGradient id={INSTAGRAM_GRADIENT_ID} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FEDA75" />
          <stop offset="25%" stopColor="#FA7E1E" />
          <stop offset="50%" stopColor="#D62976" />
          <stop offset="75%" stopColor="#962FBF" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect
        x="2.4"
        y="2.4"
        width="19.2"
        height="19.2"
        rx="5.4"
        fill="none"
        stroke={`url(#${INSTAGRAM_GRADIENT_ID})`}
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r="4.6"
        fill="none"
        stroke={`url(#${INSTAGRAM_GRADIENT_ID})`}
        strokeWidth="2"
      />
      <circle cx="17.4" cy="6.6" r="1.4" fill={`url(#${INSTAGRAM_GRADIENT_ID})`} />
    </svg>
  );
}

/** Facebook's published brand blue. */
const FACEBOOK_BLUE = "#1877F2";

export function FacebookMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-testid="brand-mark-facebook"
    >
      <circle cx="12" cy="12" r="12" fill={FACEBOOK_BLUE} />
      {/*
        The "f" is drawn as one filled path rather than stroked, so it stays
        crisp at 16px where a stroke would blur. Geometry is inset from the
        24px disc on purpose: the official lockup keeps clear space around
        the letterform, and a glyph that touches the circle edge reads as a
        blob rather than as the logo.
          stem   x 10.0–13.0, y 4.6–19.6
          bar    y 12.4–15.0, x 8.8–15.8
          hook   curls right from the stem top to x 17.9
      */}
      <path
        fill="#fff"
        d="M10 19.6v-4.6H8.8v-2.6H10v-2c0-3.8 2-5.8 5.2-5.8 1.2 0 2.2.3 2.7.6l-.9 2.6c-.4-.2-.9-.3-1.4-.3-1.7 0-2.6.9-2.6 2.7v2.2h2.8l-.3 2.6h-2.5v4.6H10Z"
      />
    </svg>
  );
}
