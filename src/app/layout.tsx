import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "laratik-planner",
    template: "%s · laratik-planner",
  },
  description:
    "Social media planning, design, and approvals for one agency. Self-hosted on the LaraTik VPS.",
  applicationName: "laratik-planner",
  robots: { index: false, follow: false }, // private app, never index
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="bg-canvas text-fg-primary min-h-full">{children}</body>
    </html>
  );
}
