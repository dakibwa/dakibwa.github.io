"use client";

import { useEffect, useRef } from "react";
import { TermsPrivacyInformation } from "@/components/PolicyInformation";

export function BookingInformation() {
  const termsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function revealLinkedInformation() {
      const section = window.location.hash.slice(1);
      // Previously shared and emailed links still open the combined information.
      const disclosure = ["terms-privacy", "booking", "change-booking", "privacy"].includes(section)
        ? termsRef.current : null;
      if (!disclosure) return;
      disclosure.open = true;
      requestAnimationFrame(() => disclosure.scrollIntoView({ behavior: "instant", block: "start" }));
    }

    function revealRepeatedLink(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (
        link?.origin === window.location.origin &&
        link.pathname === window.location.pathname &&
        link.hash === window.location.hash
      ) {
        // Clicking the same fragment again does not emit hashchange.
        revealLinkedInformation();
      }
    }

    revealLinkedInformation();
    window.addEventListener("hashchange", revealLinkedInformation);
    document.addEventListener("click", revealRepeatedLink);
    return () => {
      window.removeEventListener("hashchange", revealLinkedInformation);
      document.removeEventListener("click", revealRepeatedLink);
    };
  }, []);

  return (
    <section className="booking-information" id="change-booking" aria-label="Terms and privacy">
      <details className="policy-disclosure" id="terms-privacy" ref={termsRef}>
        <summary>Terms &amp; privacy</summary>
        <TermsPrivacyInformation />
      </details>
    </section>
  );
}
