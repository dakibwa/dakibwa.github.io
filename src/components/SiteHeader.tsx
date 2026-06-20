import Link from "next/link";

type SiteHeaderPage = "home" | "faq" | "book";

type SiteHeaderProps = {
  currentPage?: SiteHeaderPage;
};

export function SiteHeader({ currentPage = "home" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-current={currentPage === "home" ? "page" : undefined} aria-label="Portuguese with Inês home">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-text">
          Portuguese with <span className="brand-red">Inês</span>
        </span>
      </Link>
      <nav className="nav-actions" aria-label="Main navigation">
        <Link
          href="/faq"
          className="faq-tile-button"
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
    </header>
  );
}
