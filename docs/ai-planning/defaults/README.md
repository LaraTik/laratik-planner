# Default planning packs

This directory contains the version-controlled, reviewed defaults for monthly
planning. The nineteen source documents supplied with the product brief are
mapped one-to-one in `manifest.json`; they remain source material and are not
executed as prompts. The runtime uses the manifest to select a mode, collect
inputs, pause on blocking questions, validate outputs, and report risks.

## Precedence

`Canonical defaults → Agency published pack → Workspace published pack → Monthly-session overrides`

Only published revisions enter an AI context. Draft revisions can be edited,
validated, imported, and exported without changing an active session. A pack
revision must keep its Markdown source alongside the structured manifest so a
human can review the complete instruction in either form.

## Editorial decisions

- Questions precede generation when objective, audience, offer, or production
  reality is missing.
- Confirmed facts, missing information, suggestions, and assumptions stay
  separate in both chat and proposal output.
- Discovery, strategy, and execution transitions are explicit and reviewable.
- Audience-facing copy follows the month’s selected content language; internal
  chat follows the user’s interface language and is never forced to Arabic.
- Conflicts between the Brand Profile, monthly inputs, and last-month review
  pause the affected decision instead of being resolved silently.
- Every important idea receives repetition, CTA, production-realism, AI-fit,
  and paid-fit checks before proposal review.
