"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSession } from "@/lib/auth-api";

/**
 * Shown only once a student has a session.
 *
 * The header is otherwise static, and this page is exported statically, so the
 * link has to appear after hydration rather than being rendered server-side.
 * Hidden until then, so it never flashes in for a signed-out visitor.
 */
export function AccountNavLink({ currentPage }: { currentPage?: string }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(readSession()));
  }, []);

  if (!signedIn) return null;

  return (
    <Link
      aria-current={currentPage === "my-lessons" ? "page" : undefined}
      className="site-nav__link site-nav__link--account"
      href="/my-lessons"
    >
      My lessons
    </Link>
  );
}
