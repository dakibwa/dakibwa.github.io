"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "@/lib/config";
import { browserTimeZone } from "@/lib/booking-api";
import { signInWithGoogle, storeSession, type Student } from "@/lib/auth-api";

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google sign-in could not load.")));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in could not load."));
    document.head.appendChild(script);
  });
}

/** Google's own four-colour mark. Kept on a white chip so it stays legible on coral. */
function GoogleMark() {
  return (
    <span className="google-signin__mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    </span>
  );
}

/**
 * Renders nothing at all when no client id is configured, or when Google's
 * script is blocked — a common outcome behind privacy extensions. Email and
 * password sits beside it and always works, so this is an addition rather than
 * a dependency.
 *
 * Google will not let its button be styled, so the button a student sees is
 * ours and Google's own is held invisibly over it: seen here, clicked there.
 * The ID token and the Worker's verification are untouched by any of it.
 *
 * What Google renders is not fixed. In this page it is sometimes a real button
 * in the DOM and sometimes only a cross-origin iframe — the same client id gave
 * one shape in development and the other in production, and CSS written for the
 * first silently displaced the second, leaving coral that looked like a button
 * and did nothing. So neither shape is assumed: whichever arrives is measured
 * and scaled onto the face. Scaling rather than resizing is what makes the
 * whole face live, because it takes the hit area with it — and distorting
 * something already at zero opacity costs nothing.
 */
export function GoogleSignInButton({
  onSignedIn,
  onError
}: {
  onSignedIn: (student: Student) => void;
  onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);

  const handleCredential = useCallback(
    async (credential: string) => {
      try {
        const result = await signInWithGoogle(credential, browserTimeZone());
        storeSession(result.session);
        onSignedIn(result.student);
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : "That Google sign-in didn't work.");
      }
    },
    [onSignedIn, onError]
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    let frame = 0;
    const observers: { disconnect: () => void }[] = [];

    function fit() {
      const wrapper = wrap.current;
      const holderEl = holder.current;
      if (!wrapper || !holderEl) return;

      const target = holderEl.querySelector<HTMLElement>('[role="button"]') ?? holderEl.querySelector("iframe");
      if (!target) return;

      // Measure unscaled, or each pass would compound the last one's scale.
      target.style.transform = "none";
      const natural = target.getBoundingClientRect();
      const face = wrapper.getBoundingClientRect();
      if (!natural.width || !natural.height || !face.width || !face.height) return;

      target.style.position = "absolute";
      target.style.top = "0";
      target.style.left = "0";
      target.style.margin = "0";
      target.style.transformOrigin = "top left";
      target.style.transform = `scale(${face.width / natural.width}, ${face.height / natural.height})`;
    }

    function scheduleFit() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }

    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void handleCredential(response.credential);
          }
        });

        window.google.accounts.id.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.min(400, Math.floor(wrap.current?.getBoundingClientRect().width ?? 0) || 320)
        });
        setAvailable(true);

        // Google renders asynchronously and does not always render the same
        // thing: sometimes a button in this page, sometimes only an iframe.
        // Watch for whichever arrives rather than assuming one of them.
        const mutations = new MutationObserver(scheduleFit);
        mutations.observe(holder.current, { childList: true, subtree: true });
        observers.push(mutations);

        if (wrap.current) {
          const resizes = new ResizeObserver(scheduleFit);
          resizes.observe(wrap.current);
          observers.push(resizes);
        }

        scheduleFit();
      })
      .catch(() => {
        // Blocked or offline. The password form is right there.
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [handleCredential]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className={available ? "google-signin" : "google-signin is-loading"}>
      <div className="google-signin__button" ref={wrap}>
        {/* The visible button. Inert: every pointer and key event belongs to
            Google's own button stretched invisibly on top of it, which is also
            what a screen reader announces. */}
        <span aria-hidden="true" className="google-signin__face">
          <GoogleMark />
          Continue with Google
        </span>
        <div className="google-signin__real" ref={holder} />
      </div>
      {available ? (
        <p className="google-signin__divider">
          <span>or</span>
        </p>
      ) : null}
    </div>
  );
}
