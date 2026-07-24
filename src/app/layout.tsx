import type { Metadata } from "next";
import { Beth_Ellen, Montserrat } from "next/font/google";
import { publicAssetUrl } from "@/lib/paths";
import "./globals.css";

const bethEllen = Beth_Ellen({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-beth-ellen"
});

const montserrat = Montserrat({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat"
});

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
    <html
      className={`${bethEllen.variable} ${montserrat.variable}`}
      lang="en"
      data-scroll-behavior="smooth"
    >
      {/* The recolourable splat mask (extracted from the green business card)
          is exposed as a CSS var here so it resolves through the site base
          path and every surface can paint the motif in any brand colour. */}
      <body
        style={{
          ["--paper-texture" as string]: publicAssetUrl("/visuals/paper-grain.svg"),
          ["--splat-mask" as string]: publicAssetUrl("/visuals/splat-mask.png")
        }}
      >
        {children}
      </body>
    </html>
  );
}
