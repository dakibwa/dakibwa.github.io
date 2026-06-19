"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Mail, RotateCcw } from "lucide-react";
import { CALCOM_LINK, getCalComUrl } from "@/lib/config";

type CalCommandArgs = unknown[];
type CalApi = ((command: string, ...args: CalCommandArgs) => void) & {
  loaded?: boolean;
  ns?: Record<string, CalApi>;
  q?: CalCommandArgs[];
};

declare global {
  interface Window {
    Cal?: CalApi;
  }
}

const calComLink = CALCOM_LINK;
const calComUrl = getCalComUrl(calComLink);
const calScriptSrc = "https://app.cal.com/embed/embed.js";

function loadCalEmbed() {
  if (window.Cal) {
    window.Cal.ns = window.Cal.ns ?? {};
    return window.Cal;
  }

  const cal = ((...args: CalCommandArgs) => {
    cal.q = cal.q ?? [];
    cal.q.push(args);
  }) as CalApi;

  cal.q = [];
  cal.ns = {};
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
          Book a lesson
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
            <div className="calcom-widget-stack">
              <div
                ref={widgetRef}
                className="calcom-embed-frame"
                aria-busy={!embedReady}
                aria-label="Cal.com booking widget"
              />
              <a className="button button-secondary calcom-direct-link" href={calComUrl} target="_blank" rel="noreferrer">
                Open in Cal.com
              </a>
            </div>
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
