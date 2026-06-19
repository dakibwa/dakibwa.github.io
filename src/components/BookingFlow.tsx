"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Mail, RotateCcw } from "lucide-react";

type CalCommandArgs = unknown[];
type CalApi = ((command: string, ...args: CalCommandArgs) => void) & {
  loaded?: boolean;
  q?: CalCommandArgs[];
};

declare global {
  interface Window {
    Cal?: CalApi;
  }
}

const calComLink = normalizeCalComLink(process.env.NEXT_PUBLIC_CALCOM_LINK ?? "");
const calScriptSrc = "https://app.cal.com/embed/embed.js";

function normalizeCalComLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "cal.com" || parsed.hostname === "app.cal.com") {
      return parsed.pathname.replace(/^\/+/, "").replace(/[?#].*$/, "");
    }
  } catch {
    // Fall through for plain Cal.com links like "ines/first-portuguese-lesson".
  }

  return trimmed
    .replace(/^https?:\/\/(?:app\.)?cal\.com\//, "")
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "");
}

function loadCalEmbed() {
  if (window.Cal) return window.Cal;

  const cal = ((...args: CalCommandArgs) => {
    cal.q = cal.q ?? [];
    cal.q.push(args);
  }) as CalApi;

  cal.q = [];
  window.Cal = cal;

  const script = document.createElement("script");
  script.src = calScriptSrc;
  script.async = true;
  document.head.appendChild(script);
  cal.loaded = true;

  return cal;
}

const manageNotes = [
  {
    title: "Book a new lesson",
    text: "Pick a time in Cal.com, answer the lesson questions, and complete payment in the same flow.",
    icon: CalendarDays
  },
  {
    title: "Manage an existing booking",
    text: "Use the reschedule or cancel links in your Cal.com confirmation email so the calendar stays accurate.",
    icon: RotateCcw
  },
  {
    title: "Check your confirmation",
    text: "Cal.com emails the lesson details, location notes, payment receipt, and the links you need later.",
    icon: Mail
  }
];

export function BookingFlow() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [embedReady, setEmbedReady] = useState(false);
  const isConfigured = Boolean(calComLink);

  useEffect(() => {
    if (!isConfigured || !widgetRef.current) return;

    const parentElement = widgetRef.current;
    parentElement.innerHTML = "";

    const cal = loadCalEmbed();
    cal("init", { origin: "https://app.cal.com" });
    cal("inline", {
      elementOrSelector: parentElement,
      calLink: calComLink
    });
    setEmbedReady(true);

    return () => {
      parentElement.innerHTML = "";
    };
  }, [isConfigured]);

  return (
    <main>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Portuguese with Inês home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Portuguese with Inês</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/faq">FAQ</Link>
        </nav>
        <Link className="button button-primary compact" href="/book" aria-current="page">
          Book / manage
        </Link>
      </header>

      <section className="booking-shell">
        <div className="booking-story">
          <h1>Book or manage your lesson.</h1>
          <span className="hero-rule" aria-hidden="true" />
          <p>
            Choose a time for your first lesson or manage an existing booking.
          </p>
          <div className="manage-card">
            <strong>Already booked?</strong>
            <span>Search your email for Cal.com and Portuguese with Inês.</span>
          </div>
          <div className="booking-side-notes" aria-label="Booking and management details">
            {manageNotes.map((item) => {
              const Icon = item.icon;
              return (
                <article className="booking-side-note" key={item.title}>
                  <Icon size={31} aria-hidden="true" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <section className="booking-calendar-panel" aria-label="Embedded lesson booking">
          <div className="calendar-panel-header">
            <p className="quiet-line">Cal.com booking</p>
            <h2>Choose a time</h2>
          </div>
          {isConfigured ? (
            <div
              ref={widgetRef}
              className="calcom-embed-frame"
              aria-busy={!embedReady}
              aria-label="Cal.com booking widget"
            />
          ) : (
            <div className="booking-placeholder" aria-label="Cal.com setup placeholder">
              <span className="placeholder-icon" aria-hidden="true">
                <CalendarDays size={34} />
              </span>
              <h2>Booking will open here.</h2>
              <p>Once Inês connects her Cal.com event, available times and payment will appear in this space.</p>
              <span className="placeholder-status">Calendar coming soon</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
