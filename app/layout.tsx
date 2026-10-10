import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--f-body" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Ledger",
  description: "Charges, credits and subscriptions",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // An explicit light/dark choice is kept in a cookie so the first paint already has it; otherwise follow the system.
  const t = (await cookies()).get("theme")?.value;
  const theme = t === "light" || t === "dark" ? t : undefined;
  return (
    <html lang="en-IN" className={`${sans.variable} ${mono.variable}`} data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
