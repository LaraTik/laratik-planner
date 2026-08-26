"use client";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Type as TypeIcon } from "lucide-react";
import {
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Montserrat,
  Poppins,
  Playfair_Display,
  Merriweather,
  Source_Sans_3,
  Raleway,
  Nunito,
  Work_Sans,
  Fira_Sans,
  IBM_Plex_Sans,
} from "next/font/google";
import { createFontAssetAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * TypographyForm — create form for the brand-kit Typography section.
 *
 * Fields: name, family (text input with datalist of common Google
 * Fonts), weight (100-900 in steps of 100), role (Headline / Body /
 * Accent / Mono). A live preview card shows the sample text in the
 * currently-selected family + weight using the `next/font` loader so
 * the user gets an honest preview without FOUT.
 *
 * The 14 families in the datalist are pre-imported via
 * `next/font/google` at module load. Any other family name falls
 * back to a generic CSS `font-family` declaration (the page still
 * renders, but the user sees a system-font preview until they
 * pick a known family).
 */

type FontRole = "headline" | "body" | "accent" | "mono";
const ROLES: { value: FontRole; label: string }[] = [
  { value: "headline", label: "Headline" },
  { value: "body", label: "Body" },
  { value: "accent", label: "Accent" },
  { value: "mono", label: "Mono" },
];

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";

// Pre-load the 14 datalist families so the live preview can use
// the real font. `next/font/google` resolves the font at build
// time and serves it from the static asset pipeline (no FOUT, no
// render-blocking CSS @import).
const inter = Inter({ subsets: ["latin"], display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], display: "swap" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap" });
const raleway = Raleway({ subsets: ["latin"], display: "swap" });
const nunito = Nunito({ subsets: ["latin"], display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap" });
const firaSans = Fira_Sans({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], display: "swap" });

const KNOWN_FAMILIES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Source Sans Pro",
  "Raleway",
  "Nunito",
  "Work Sans",
  "Fira Sans",
  "IBM Plex Sans",
] as const;

type KnownFamily = (typeof KNOWN_FAMILIES)[number];

function fontClassFor(family: string): string | null {
  switch (family as KnownFamily) {
    case "Inter":
      return inter.className;
    case "Roboto":
      return roboto.className;
    case "Open Sans":
      return openSans.className;
    case "Lato":
      return lato.className;
    case "Montserrat":
      return montserrat.className;
    case "Poppins":
      return poppins.className;
    case "Playfair Display":
      return playfair.className;
    case "Merriweather":
      return merriweather.className;
    case "Source Sans Pro":
      return sourceSans.className;
    case "Raleway":
      return raleway.className;
    case "Nunito":
      return nunito.className;
    case "Work Sans":
      return workSans.className;
    case "Fira Sans":
      return firaSans.className;
    case "IBM Plex Sans":
      return ibmPlexSans.className;
    default:
      return null;
  }
}

export function TypographyForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createFontAssetAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const [family, setFamily] = React.useState("Inter");
  const [weight, setWeight] = React.useState(400);
  const [role, setRole] = React.useState<FontRole>("headline");
  const formRef = React.useRef<HTMLFormElement>(null);
  // Round 5: reset the form on success so the user can add a
  // second font without manually clearing the fields.
  useSuccessReset(state, formRef);

  const fontClass = fontClassFor(family);
  const previewSize = role === "headline" ? 28 : role === "accent" ? 22 : 16;

  return (
    <Card padding="md" className="mb-3">
      <form ref={formRef} action={action} className="grid gap-3">
        <FormField id="typography-name" label="Name" required>
          <Input
            id="typography-name"
            className="mt-0"
            name="name"
            required
            maxLength={80}
            placeholder="Heading, Body, Mono caption…"
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="typography-family" label="Family" required>
            <Input
              id="typography-family"
              className="mt-0"
              name="family"
              required
              maxLength={120}
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              list="typography-known-families"
              data-testid="typography-family-input"
            />
          </FormField>
          <datalist id="typography-known-families">
            {KNOWN_FAMILIES.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>

          <FormField id="typography-weight" label="Weight" required>
            <input
              id="typography-weight"
              type="number"
              name="weight"
              min={100}
              max={900}
              step={100}
              required
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              data-testid="typography-weight-input"
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full [appearance:textfield] rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </FormField>

          <FormField id="typography-role" label="Role" required>
            <select
              id="typography-role"
              name="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value as FontRole)}
              data-testid="typography-role-input"
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div
          className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
          aria-label="Live preview"
          data-testid="typography-preview"
        >
          <p className="text-label text-fg-muted mb-1 inline-flex items-center gap-1 font-semibold">
            <TypeIcon className="h-3 w-3" aria-hidden="true" />
            Preview — {family} {weight} ({role})
          </p>
          <p
            className={fontClass ?? undefined}
            style={{
              fontFamily: fontClass ? undefined : `"${family}", system-ui, sans-serif`,
              fontWeight: weight,
              fontSize: `${previewSize}px`,
              lineHeight: 1.4,
            }}
          >
            {SAMPLE_TEXT}
          </p>
        </div>

        <div className="flex items-center justify-end">
          <SubmitButton />
        </div>
        {state?.error ? (
          <p role="alert" className="text-label text-danger font-semibold">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="default"
      variant="default"
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid="typography-submit"
    >
      {pending ? "Adding…" : "Add font"}
    </Button>
  );
}

// Re-export so the page can import the trash icon in one place.
export { Trash2 };
