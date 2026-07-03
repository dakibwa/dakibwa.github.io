import Image from "next/image";
import Link from "next/link";
import { publicAssetPath } from "@/lib/paths";

type SiteHeaderPage = "home" | "faq" | "book";

type SiteHeaderProps = {
  currentPage?: SiteHeaderPage;
};

export function SiteHeader({ currentPage = "home" }: SiteHeaderProps) {
  const lessonHref = currentPage === "home" ? "#lessons" : "/#lessons";

  return (
    <header className="site-header">
      <Link
        href="/"
        className="brand"
        aria-current={currentPage === "home" ? "page" : undefined}
        aria-label="Português com a Inês home"
      >
        <Image
          alt=""
          aria-hidden="true"
          className="brand-wordmark-image"
          height={84}
          loading="eager"
          priority
          src={publicAssetPath("/visuals/mockup-wordmark-lavender.png")}
          width={192}
        />
        <span className="sr-only">Português com a Inês</span>
      </Link>
      <nav className="nav-actions" aria-label="Main navigation">
        <Link href={lessonHref} className="nav-text-link nav-lessons-link">
          Lessons
        </Link>
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
    </header>
  );
}
