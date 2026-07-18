import Link from "next/link";
import { Mail } from "lucide-react";
import { BrandWordmark } from "@/components/BrandWordmark";
import { Splat } from "@/components/BrandMarks";
import { CONTACT_WHATSAPP_URL } from "@/lib/config";

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="home-footer">
      <Splat className="footer-splat" />
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <BrandWordmark className="footer-wordmark" />
          <p>
            Portuguese lessons in Porto
            <span>One-to-one. Practical. Personal.</span>
          </p>
          <p className="footer-tagline">Handmade · Practical · Personal</p>
        </div>
        <div className="footer-side">
          <nav className="footer-nav" aria-label="Footer">
            <Link href="/faq">FAQ</Link>
          </nav>
          <div className="footer-social" aria-label="Contact Inês">
            <a
              href="https://www.instagram.com/aprenderportuguelines"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <InstagramGlyph />
            </a>
            <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Message Inês">
              <Mail aria-hidden="true" />
            </a>
          </div>
          <Link className="book-lesson-button footer-book-button" href="/book">
            <span>Book a lesson</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
