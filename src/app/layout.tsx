import type { Metadata } from "next";
import { Beth_Ellen, Montserrat } from "next/font/google";
import { preload } from "react-dom";
import { RouteMotion } from "@/components/RouteMotion";
import { publicAssetPath, publicAssetUrl } from "@/lib/paths";
import "./globals.css";

const bethEllen = Beth_Ellen({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-beth-ellen"
});

const montserrat = Montserrat({
  weight: ["400", "600", "700"],
  style: "normal",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat"
});

export const metadata: Metadata = {
  title: "Português com a Inês | Portuguese lessons in Porto",
  description:
    "One-to-one European Portuguese lessons in Porto and online, with a native speaker from Porto. Any level, no fixed syllabus.",
  openGraph: {
    title: "Português com a Inês | Portuguese lessons in Porto",
    description: "One-to-one European Portuguese lessons in Porto and online. Any level.",
    type: "website"
  }
};

/**
 * Both of these reach the browser through a CSS custom property — the wordmark
 * as a mask-image, the grain as a background-image — so the preload scanner
 * cannot see either until the stylesheet has downloaded and style resolution
 * has run. The wordmark is the header logo on every route, which meant the
 * masthead arrived a stylesheet later than the text beside it. Preloading makes
 * both discoverable in the first pass over the HTML instead.
 */
const maskedBrandAssets = ["/visuals/wordmark-cream.webp", "/visuals/paper-grain.svg"];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  for (const asset of maskedBrandAssets) {
    preload(publicAssetPath(asset), { as: "image" });
  }

  return (
    <html
      className={`${bethEllen.variable} ${montserrat.variable}`}
      lang="en"
      data-scroll-behavior="smooth"
    >
      <body
        style={{
          ["--paper-texture" as string]: publicAssetUrl("/visuals/paper-grain.svg")
        }}
      >
        {children}
        <RouteMotion />
      </body>
    </html>
  );
}
