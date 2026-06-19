import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
