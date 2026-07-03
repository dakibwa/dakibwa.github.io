import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { publicAssetUrl } from "@/lib/paths";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inês Dias Baía | Português lessons in Porto",
  description: "Simple, friendly Português lessons in Porto with Inês Dias Baía.",
  openGraph: {
    title: "Inês Dias Baía | Português lessons in Porto",
    description: "Português that feels useful from day one.",
    type: "website"
  }
};

const assetVariables = {
  "--asset-azulejo-mark": publicAssetUrl("/visuals/azulejo-mark.svg"),
  "--asset-card-radial": publicAssetUrl("/visuals/card-radial-lavender.svg"),
  "--asset-card-wordmark": publicAssetUrl("/visuals/card-wordmark-lavender.svg"),
  "--asset-mockup-wordmark": publicAssetUrl("/visuals/mockup-wordmark-lavender.png"),
  "--asset-brand-flower": publicAssetUrl("/visuals/brand-flower-brush.svg"),
  "--asset-mockup-flower": publicAssetUrl("/visuals/mockup-flower-lavender.png"),
  "--asset-booking-still": publicAssetUrl("/visuals/lesson-booking-still.webp"),
  "--asset-hero-strip": publicAssetUrl("/visuals/lesson-hero-strip.webp"),
  "--asset-faq-azulejo-corner": publicAssetUrl("/visuals/faq-azulejo-corner.png"),
  "--asset-faq-hero-scene": publicAssetUrl("/visuals/lesson-faq-contact-graphic.webp"),
  "--asset-faq-tile-frame": publicAssetUrl("/visuals/faq-tile-frame.svg")
} as CSSProperties;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" style={assetVariables}>
      <body>{children}</body>
    </html>
  );
}
