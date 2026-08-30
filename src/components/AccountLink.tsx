"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSession, SESSION_CHANGE_EVENT } from "@/lib/auth-api";

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
    const update = () => setSignedIn(Boolean(readSession()));
    update();
    window.addEventListener(SESSION_CHANGE_EVENT, update);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, update);
  }, []);

  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className={className}
      href={signedIn ? "/book/#lesson-calendar" : "/book/?view=lessons#lesson-calendar"}
    >
      {signedIn ? "My calendar" : "Sign in"}
    </Link>
  );
}
