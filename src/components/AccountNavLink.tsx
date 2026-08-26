"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSession } from "@/lib/auth-api";

/**
 * One permanent nav slot for the student's own area.
 *
 * It always points at /my-lessons, which shows the sign-in panel when there is
 * no session and their lessons when there is — so one destination serves both
 * states and the label is only ever a description of which one you are in.
 *
 * Rendered server-side as "Sign in" and relabelled after hydration. Showing it
 * only when signed in, as it was before, left a returning student with no way
 * back to their lessons; rendering nothing until hydration would shift the
 * whole nav as it appeared.
 */
export function AccountNavLink({ currentPage }: { currentPage?: string }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(readSession()));
  }, []);

  return (
    <Link
      aria-current={currentPage === "my-lessons" ? "page" : undefined}
      className="site-nav__link site-nav__link--account"
      href="/my-lessons"
    >
      {signedIn ? "My lessons" : "Sign in"}
    </Link>
  );
}
