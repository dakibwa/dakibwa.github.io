"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSession } from "@/lib/auth-api";

/**
 * The student's own area, labelled for whichever state they are in.
 *
 * Shared by the header and the footer so the two navigations say the same
 * thing — the footer used to stop at Booking, so the account existed in one
 * navigation and not the other.
 *
 * Rendered as "Sign in" server-side and relabelled after hydration, so the
 * layout does not shift as it loads.
 */
export function AccountLink({ className, isCurrent = false }: { className?: string; isCurrent?: boolean }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(readSession()));
  }, []);

  return (
    <Link aria-current={isCurrent ? "page" : undefined} className={className} href="/my-lessons">
      {signedIn ? "My lessons" : "Sign in"}
    </Link>
  );
}
