"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/*
 * The entrance fade is for arriving at the site, not for moving around it.
 * This used to intercept every internal click and hold navigation for
 * 80–110ms to play an exit fade — a deliberate delay on every page change,
 * which read as lag once the pages themselves were fast. Now navigation is
 * left to Next (instant, against a prefetched route) and this component only
 * marks the moment the first in-app navigation happens, so the CSS can turn
 * the entrance animation off for every page after the first.
 *
 * useLayoutEffect, not useEffect: the class must be on <html> before the new
 * page paints, or the fade starts for one frame and is then cancelled, which
 * shows as a flicker.
 */
export function RouteMotion() {
  const pathname = usePathname();
  const initialPathname = useRef(pathname);

  useLayoutEffect(() => {
    if (pathname !== initialPathname.current) {
      document.documentElement.classList.add("route-arrived");
    }
  }, [pathname]);

  return null;
}
