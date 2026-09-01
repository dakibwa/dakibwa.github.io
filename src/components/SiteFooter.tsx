import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { BrandWordmark } from "@/components/BrandWordmark";

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
        <Link href="/booking-terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
      {/* Just the way back to the rest of the site. "Message Inês" lives in the
          header and on the FAQ, and a third copy down here was the loudest thing
          in a footer whose job is navigation. */}
      <div className="site-footer__contact">
        <BackToTop />
      </div>
    </footer>
  );
}
