import Image from "next/image";
import { publicAssetPath } from "@/lib/paths";

export function SiteFooter() {
  return (
    <footer className="home-footer">
      <Image
        alt="Português com a Inês"
        className="footer-wordmark"
        height={84}
        loading="eager"
        src={publicAssetPath("/visuals/mockup-wordmark-lavender.png")}
        width={192}
      />
      <p>
        Portuguese lessons in Porto
        <span>One-to-one. Practical. Personal.</span>
      </p>
      <span className="footer-radial-mark" aria-hidden="true" />
    </footer>
  );
}
