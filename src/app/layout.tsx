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
 * The header wordmark is now an actual <img> so the browser's preload scanner
 * can discover it directly. We keep an explicit preload to ensure it starts
 * before layout-dependent resources. Since it's now a standard image element
 * (not a CSS mask), crossOrigin is not needed for same-origin assets.
 */
const wordmarkAsset = "/visuals/wordmark-cream.webp";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload(publicAssetPath(wordmarkAsset), { as: "image", fetchPriority: "high" });

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
