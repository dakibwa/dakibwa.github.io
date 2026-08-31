import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";
import { SiteNav } from "@/components/SiteNav";

export type SitePage = "home" | "approach" | "lessons" | "faq" | "book" | "my-lessons";

type SiteHeaderProps = {
  currentPage?: SitePage;
};

export function SiteHeader({ currentPage = "home" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="site-header__inner">
        <Link
          href="/"
          className="site-header__brand"
          aria-current={currentPage === "home" ? "page" : undefined}
          aria-label="Português com a Inês, home"
        >
          <BrandWordmark priority className="header-wordmark" />
        </Link>
        <SiteNav currentPage={currentPage} />
      </div>
    </header>
  );
}
