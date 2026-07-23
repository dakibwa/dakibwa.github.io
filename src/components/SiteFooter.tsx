import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";
import { CONTACT_WHATSAPP_URL } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <BrandWordmark tone="cream" className="footer-wordmark" />
      </div>
      <nav className="site-footer__nav" aria-label="Footer navigation">
        <Link href="/approach">Approach</Link>
        <Link href="/lessons">Lessons</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/book">Booking</Link>
      </nav>
      <div className="site-footer__contact">
        <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
          Message Inês
        </a>
      </div>
    </footer>
  );
}
