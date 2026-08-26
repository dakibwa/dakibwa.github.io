"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Renders nothing at all when no client id is configured, or when Google's
 * script is blocked — a common outcome behind privacy extensions. Email and
 * password sits beside it and always works, so this is an addition rather than
 * a dependency.
 */
export function GoogleSignInButton({
  onSignedIn,
  onError
}: {
  onSignedIn: (student: Student) => void;
  onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              const result = await signInWithGoogle(response.credential, browserTimeZone());
              storeSession(result.session);
              onSignedIn(result.student);
            } catch (caught) {
              onError(caught instanceof Error ? caught.message : "That Google sign-in didn't work.");
            }
          }
        });

        // Google renders at a fixed pixel width, so it has to be told the
        // space available or it sits narrower than every field beneath it.
        // 400 is Google's own maximum.
        const available = Math.min(400, Math.floor(holder.current.getBoundingClientRect().width) || 320);

        window.google.accounts.id.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "center",
          width: available
        });
        setAvailable(true);
      })
      .catch(() => {
        // Blocked or offline. The password form is right there.
      });

    return () => {
      cancelled = true;
    };
  }, [onSignedIn, onError]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className={available ? "google-signin" : "google-signin is-loading"}>
      <div ref={holder} />
      {available ? (
        <p className="google-signin__divider">
          <span>or</span>
        </p>
      ) : null}
    </div>
  );
}
