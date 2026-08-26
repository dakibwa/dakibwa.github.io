"use client";

import { ArrowUp, Menu } from "lucide-react";

function scrollToTop() {
  window.scrollTo({
    top: 0,
    // Honours a reduced-motion preference, as the rest of the site does.
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  });
}

/**
 * The two things worth doing from the bottom of a page.
 *
 * Menu only shows below 820px, where the header's links are behind a toggle;
 * above that the footer already lists every page across one row. It asks the
 * header to open by event, since the two live in separate trees with the whole
 * page between them.
 */
export function BackToTop() {
  return (
    <>
      <button
        className="site-footer__top site-footer__menu"
        onClick={() => window.dispatchEvent(new CustomEvent("ines:open-menu"))}
        type="button"
      >
        <Menu aria-hidden="true" size={15} />
        Menu
      </button>
      <button className="site-footer__top" onClick={scrollToTop} type="button">
        <ArrowUp aria-hidden="true" size={15} />
        Top
      </button>
    </>
  );
}
