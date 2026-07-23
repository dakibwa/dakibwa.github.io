import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";

export type SitePage = "home" | "approach" | "lessons" | "faq" | "book";

type SiteHeaderProps = {
  currentPage?: SitePage;
};

const navigation: Array<{ href: string; id: SitePage; label: string }> = [
  { href: "/approach", id: "approach", label: "Approach" },
  { href: "/lessons", id: "lessons", label: "Lessons" },
  { href: "/faq", id: "faq", label: "FAQ" },
  { href: "/book", id: "book", label: "Booking" }
];

export function SiteHeader({ currentPage = "home" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          href="/"
          className="site-header__brand"
          aria-current={currentPage === "home" ? "page" : undefined}
          aria-label="Português com a Inês — home"
        >
          <BrandWordmark priority className="header-wordmark" />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              href={item.href}
              className="site-nav__link"
              aria-current={currentPage === item.id ? "page" : undefined}
              key={item.id}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
