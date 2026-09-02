"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SitePage } from "@/components/SiteHeader";

type NavItem = { href: string; id: SitePage; label: string };

const navigation: NavItem[] = [
  { href: "/approach", id: "approach", label: "Approach" },
  { href: "/lessons", id: "lessons", label: "Lessons" },
  { href: "/faq", id: "faq", label: "FAQ" },
  { href: "/book", id: "book", label: "Booking" }
];

export function SiteNav({ currentPage }: { currentPage: SitePage }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Navigating away must close the panel, or it stays open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The footer's Menu button asks for this menu without either component
  // needing to know about the other.
  useEffect(() => {
    function onRequest() {
      setOpen(true);
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      requestAnimationFrame(() => toggleRef.current?.focus());
    }

    window.addEventListener("ines:open-menu", onRequest);
    return () => window.removeEventListener("ines:open-menu", onRequest);
  }, []);

  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the control that opened it, not to the top of the
      // document, or a keyboard user is dropped somewhere unrelated.
      toggleRef.current?.focus();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  return (
    <>
      <nav className="site-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            aria-current={currentPage === item.id ? "page" : undefined}
            className="site-nav__link"
            href={item.href}
            key={item.id}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        aria-controls="site-nav-mobile"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className={`nav-toggle${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        <span aria-hidden="true">
          <span className="nav-toggle__line" />
          <span className="nav-toggle__line" />
          <span className="nav-toggle__line" />
        </span>
      </button>

      {/* inert, not just hidden: a closed panel must be unreachable by tab and
          invisible to a screen reader, and hiding it visually does neither. */}
      <div className={`nav-mobile${open ? " is-open" : ""}`} id="site-nav-mobile" inert={!open || undefined}>
        <div className="nav-mobile__inner">
          {navigation.map((item) => (
            <Link
              aria-current={currentPage === item.id ? "page" : undefined}
              className="nav-mobile__link"
              href={item.href}
              key={item.id}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
