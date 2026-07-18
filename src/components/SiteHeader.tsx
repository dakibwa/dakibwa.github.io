import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";

type SiteHeaderPage = "home" | "faq" | "book";

type SiteHeaderProps = {
  currentPage?: SiteHeaderPage;
};

export function SiteHeader({ currentPage = "home" }: SiteHeaderProps) {
  return (
    <header className="site-header torn-bottom">
      <div className="wrap">
        <Link
          href="/"
          className="brand"
          aria-current={currentPage === "home" ? "page" : undefined}
          aria-label="Português com a Inês home"
        >
          <BrandWordmark priority className="header-wordmark" />
        </Link>
        <nav className="nav-actions" aria-label="Main navigation">
          <Link
            href="/faq"
            className="nav-text-link nav-faq-link"
            aria-current={currentPage === "faq" ? "page" : undefined}
            aria-label="Frequently asked questions"
          >
            <span>FAQ</span>
          </Link>
          <Link
            className="book-lesson-button"
            href="/book"
            aria-current={currentPage === "book" ? "page" : undefined}
            aria-label="Book a Portuguese lesson"
          >
            <span>Book a lesson</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
