import type { Metadata } from "next";
import { Beth_Ellen, Montserrat } from "next/font/google";
import { preload } from "react-dom";
import { RouteMotion } from "@/components/RouteMotion";
import { publicAssetPath, publicAssetUrl } from "@/lib/paths";
import "./globals.css";

/*
 * Not preloaded. It is the display face — headings only — and on a slow
 * connection its 40-odd kB arrived several hundred milliseconds after the text
 * had already painted in the metric-matched fallback, so the preload bought
 * nothing and cost about 110ms of first paint by competing for the pipe.
 */
const bethEllen = Beth_Ellen({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
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
 * The header wordmark is the logo on every route, but it reaches the browser as
 * a mask-image behind a CSS custom property, so the preload scanner cannot see
 * it and nothing requests it until the stylesheet has downloaded and style
 * resolution has run. BrandWordmark already noted that its priority prop cannot
 * help, since a CSS mask does not participate in image loading priority.
 *
 * crossOrigin is required and not incidental: CSS fetches its images in CORS
 * mode, and a preload whose credentials mode does not match is discarded rather
 * than reused — which downloads the file twice instead of once. The paper grain
 * is deliberately not preloaded; at 480 bytes it arrives in a single packet and
 * is not worth an extra early request competing with the fonts.
 */
const wordmarkAsset = "/visuals/wordmark-cream.webp";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload(publicAssetPath(wordmarkAsset), { as: "image", crossOrigin: "anonymous" });

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
