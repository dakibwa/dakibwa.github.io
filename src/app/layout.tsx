import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const heading = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["500", "600", "700"]
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "Inês Dias Baía | Portuguese Lessons in Porto",
  description: "Simple, friendly Portuguese lessons in Porto with Inês Dias Baía.",
  openGraph: {
    title: "Inês Dias Baía | Portuguese Lessons in Porto",
    description: "Portuguese that feels useful from day one.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${body.variable} ${heading.variable}`}>{children}</body>
    </html>
  );
}
