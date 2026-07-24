"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const EXIT_DURATION_MS = 160;
const SAFETY_RESET_MS = 900;

function isPlainInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  return true;
}

export function RouteMotion() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.documentElement.classList.remove("route-is-leaving");
  }, [pathname]);

  useEffect(() => {
    let navigationTimer: ReturnType<typeof setTimeout> | undefined;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const clearTransition = () => {
      document.documentElement.classList.remove("route-is-leaving");
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a");
      if (!anchor || !isPlainInternalNavigation(event, anchor)) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);

      if (
        destination.origin !== current.origin ||
        (destination.pathname === current.pathname && destination.search === current.search)
      ) {
        return;
      }

      if (reducedMotion.matches) return;

      event.preventDefault();
      document.documentElement.classList.add("route-is-leaving");

      if (navigationTimer) clearTimeout(navigationTimer);
      if (safetyTimer) clearTimeout(safetyTimer);

      navigationTimer = setTimeout(() => {
        router.push(`${destination.pathname}${destination.search}${destination.hash}`);
        safetyTimer = setTimeout(clearTransition, SAFETY_RESET_MS);
      }, EXIT_DURATION_MS);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      if (navigationTimer) clearTimeout(navigationTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      clearTransition();
    };
  }, [router]);

  return <span className="route-transition-wash" aria-hidden="true" />;
}
