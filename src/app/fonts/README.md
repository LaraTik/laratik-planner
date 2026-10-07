FONTS
=====

inter-latin.woff2
Inter — https://github.com/rsms/inter
SIL Open Font License 1.1 (see Inter-LICENSE.txt)
Latin subset, variable weight axis (100–900).

noto-sans-arabic.woff2
Noto Sans Arabic — https://github.com/notofonts/arabic
SIL Open Font License 1.1
Arabic subset, variable weight axis (100–900).

WHY THESE ARE VENDORED
======================

`next/font/google` downloads each family from fonts.googleapis.com at BUILD
time. In CI that makes the Docker build depend on outbound network access to
Google, and it failed there on 2026-10-07 with:

    nextFontGoogleFontLoader ... Build failed because of webpack errors

The failure has nothing to do with application code, so a routine commit can be
blocked by someone else's connectivity. Vendoring the two faces the app
actually loads (`subsets: ["latin"]` for Inter, `subsets: ["arabic"]` for Noto)
makes the build hermetic: no network, no CDN, no flake.

Both are OFL 1.1, which permits redistribution provided the licence travels
with the files — hence Inter-LICENSE.txt in this directory.

UPDATING A FONT
===============

1. Fetch the CSS with a browser User-Agent so Google serves woff2, not ttf:
   curl -A "<browser UA>" "https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap"
2. Take the `url(...)` from the block whose `unicode-range` covers the subset
   you need and whose `font-weight` is 400 (the variable-font file is shared
   across the weight axis).
3. Replace the .woff2 in this directory and keep the OFL notice.

Note: Inter also ships cyrillic, greek and vietnamese subsets, and Noto Sans
Arabic ships others. Only the two listed here are loaded by
`src/app/layout.tsx`; add a file and a `src:` entry before using another.
