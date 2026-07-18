import type { Metadata } from "next";
import { BrandMarkSprite } from "@/components/BrandMarks";
import { publicAssetUrl } from "@/lib/paths";
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
      {/* The recolourable splat mask (extracted from the green business card)
          is exposed as a CSS var here so it resolves through the site base
          path and every surface can paint the motif in any brand colour. */}
      <body style={{ ["--splat-mask" as string]: publicAssetUrl("/visuals/splat-mask.png") }}>
        <BrandMarkSprite />
        {children}
      </body>
    </html>
  );
}
