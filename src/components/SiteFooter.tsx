import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer__nav" aria-label="Footer navigation">
        <Link href="/approach">Approach</Link>
        <Link href="/lessons">Lessons</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/book">Booking</Link>
      </nav>
      <div className="site-footer__contact">
        <BackToTop />
      </div>
    </footer>
  );
}
