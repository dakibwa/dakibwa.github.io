"use client";

import { ArrowUp } from "lucide-react";

/**
 * Sits with "Message Inês" so the footer's right-hand side carries the two
 * things worth doing from the bottom of a page, rather than a second copy of
 * the navigation.
 */
export function BackToTop() {
  return (
    <button
      className="site-footer__top"
      onClick={() =>
        window.scrollTo({
          top: 0,
          // Honours a reduced-motion preference, as the rest of the site does.
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        })
      }
      type="button"
    >
      <ArrowUp aria-hidden="true" size={15} />
      Top
    </button>
  );
}
