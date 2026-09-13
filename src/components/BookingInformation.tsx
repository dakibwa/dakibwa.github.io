"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { TermsPrivacyInformation } from "@/components/PolicyInformation";
import { keepDialogFocus } from "@/lib/dialog-focus";

const policySections = ["terms-privacy", "booking", "change-booking", "privacy"];

export function BookingInformation() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const previousOverflow = useRef<string | null>(null);

  const restorePage = useCallback(() => {
    if (dialogRef.current?.open || previousOverflow.current === null) return;
    document.body.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
    // Keep old shared links working without leaving a stale fragment on close.
    if (policySections.includes(window.location.hash.slice(1))) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    returnFocus.current = null;
  }, []);

  const closeInformation = useCallback(() => {
    dialogRef.current?.close();
    restorePage();
  }, [restorePage]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function openInformation(trigger?: HTMLElement) {
      if (!dialog || dialog.open) return;
      returnFocus.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.showModal();
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }

    function revealLinkedInformation() {
      if (policySections.includes(window.location.hash.slice(1))) openInformation();
      else if (dialog?.open) dialog.close();
    }

    function openFromLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-terms-privacy]") : null;
      if (!link || link.origin !== window.location.origin) return;
      event.preventDefault();
      // Reading the terms never navigates away, changes consent, or discards a
      // booking selection (or a private invitation fragment on another page).
      openInformation(link);
    }

    revealLinkedInformation();
    window.addEventListener("hashchange", revealLinkedInformation);
    document.addEventListener("click", openFromLink, true);
    dialog.addEventListener("close", restorePage);
    dialog.dataset.ready = "true";
    return () => {
      window.removeEventListener("hashchange", revealLinkedInformation);
      document.removeEventListener("click", openFromLink, true);
      dialog.removeEventListener("close", restorePage);
      delete dialog.dataset.ready;
      dialog.close();
      if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    };
  }, [restorePage]);

  return (
    <dialog
      aria-labelledby="terms-privacy-title"
      className="policy-dialog"
      id="terms-privacy"
      ref={dialogRef}
      onKeyDown={keepDialogFocus}
      onCancel={(event) => { event.preventDefault(); closeInformation(); }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        )) closeInformation();
      }}
    >
      <div className="policy-dialog__heading">
        <h2 id="terms-privacy-title">Terms &amp; privacy</h2>
        <button aria-label="Close terms & privacy" onClick={closeInformation} type="button">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="policy-dialog__content" ref={contentRef}>
        <TermsPrivacyInformation />
      </div>
    </dialog>
  );
}
