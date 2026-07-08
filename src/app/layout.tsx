import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Português com a Inês | Portuguese lessons in Porto",
  description:
    "One-to-one European Portuguese lessons in Porto and online with Inês. Practical, relaxed, and personal — with a native speaker.",
  openGraph: {
    title: "Português com a Inês | Portuguese lessons in Porto",
    description: "One-to-one European Portuguese lessons in Porto and online. Practical. Personal.",
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
