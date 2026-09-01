import type { Metadata } from "next";
import { IBM_Plex_Mono, Literata, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider, THEME_COOKIE, type Theme } from "@/components/theme-provider";
import "./globals.css";

// Fonts per DESIGN-SPEC §1 / the canvas Google Fonts request:
// Literata ital,opsz,wght 7..72,300..600 + italics · Space Grotesk
// 400/500/600 · IBM Plex Mono 400/500. Literata loads as a variable font
// with BOTH its wght axis (full range, covering 300–600) and its opsz
// 7–72 optical-size axis — `axes` must name opsz explicitly or next/font
// strips it from the shipped file (catch #13).
const literata = Literata({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-literata",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-space-grotesk",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Signal Notes",
  description: "Briefings grounded in your own documents.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The server reads the persisted theme cookie and stamps data-theme on
  // <html> before any paint, so there is no wrong-theme flash. Dark is the
  // default (DESIGN-SPEC §1: two themes; dark is default).
  const cookieStore = await cookies();
  const theme: Theme =
    cookieStore.get(THEME_COOKIE)?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${literata.variable} ${spaceGrotesk.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
