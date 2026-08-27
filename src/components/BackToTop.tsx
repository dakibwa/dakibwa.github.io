"use client";

import { Menu } from "lucide-react";

/**
 * One control, and only where it does something.
 *
 * Top went because Menu already returns you to the top on its way to opening,
 * so the two did the same thing side by side. Menu itself is hidden above the
 * breakpoint, where the footer already lists every page in a row and a button
 * to reveal them is a button to reveal what is already on screen.
 *
 * It asks the header to open by event, since the two live in separate trees
 * with the whole page between them.
 */
export function BackToTop() {
  return (
    <button
      className="site-footer__top site-footer__menu"
      onClick={() => window.dispatchEvent(new CustomEvent("ines:open-menu"))}
      type="button"
    >
      <Menu aria-hidden="true" size={15} />
      Menu
    </button>
  );
}
