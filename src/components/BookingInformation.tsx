"use client";

import { useEffect, useRef } from "react";
import { BookingTermsInformation, PrivacyInformation } from "@/components/PolicyInformation";

export function BookingInformation() {
  const bookingRef = useRef<HTMLDetailsElement>(null);
  const privacyRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function revealLinkedInformation() {
      const section = window.location.hash.slice(1);
      const disclosure = section === "booking" || section === "change-booking"
        ? bookingRef.current
        : section === "privacy" ? privacyRef.current : null;
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
    <section className="booking-information" id="change-booking" aria-label="Booking information">
      <details className="policy-disclosure" id="booking" ref={bookingRef}>
        <summary>Booking terms</summary>
        <BookingTermsInformation />
      </details>
      <details className="policy-disclosure" id="privacy" ref={privacyRef}>
        <summary>Your privacy</summary>
        <PrivacyInformation />
      </details>
    </section>
  );
}
