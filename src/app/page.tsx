import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Coffee,
  Globe,
  MapPin,
  MessageCircle,
  MonitorSmartphone,
  Sparkles,
  Target,
  Video
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const lessonCards = [
  {
    title: "Trial lesson",
    price: "€25",
    duration: "45 minutes",
    note: "A relaxed first session to find your level.",
    featured: true
  },
  {
    title: "Single lesson",
    price: "€45",
    duration: "60 minutes",
    note: "One-to-one, built around your goals.",
    featured: false
  },
  {
    title: "5 lessons",
    price: "€210",
    duration: "60 minutes each",
    note: "A steady weekly rhythm, save €15.",
    featured: false
  }
];

const heroPoints = [
  { icon: MapPin, label: "In Porto" },
  { icon: MonitorSmartphone, label: "Online" },
  { icon: Sparkles, label: "Native teacher" }
];

const credentials = [
  "Native speaker from Porto",
  "BA in Languages, Literatures & Cultures",
  "Teaches in Portuguese & English",
  "Online & in person"
];

const reasons = [
  {
    icon: Globe,
    title: "Real European Portuguese",
    body: "Learn the language spoken in Portugal today — the pronunciation, rhythm and everyday expressions you won't find in a textbook."
  },
  {
    icon: Target,
    title: "Built around you",
    body: "Every lesson is one-to-one and tailored to your goals: travel, daily life, work, exams, or moving to Portugal."
  },
  {
    icon: Coffee,
    title: "Relaxed and practical",
    body: "A patient, conversation-led approach with gentle correction, so speaking feels natural instead of nerve-wracking."
  }
];

const steps = [
  {
    icon: CalendarDays,
    title: "Choose a time",
    body: "Pick a slot that suits you and book securely online in a couple of clicks."
  },
  {
    icon: Video,
    title: "Meet Inês",
    body: "Join by video from anywhere, or in person in Porto, for your one-to-one lesson."
  },
  {
    icon: MessageCircle,
    title: "Start speaking",
    body: "Practise real conversations and leave every lesson with Portuguese you can use straight away."
  }
];

export default function Home() {
  return (
    <main className="home-page">
      <SiteHeader currentPage="home" />

      <section className="hero-poster">
        <div className="home-hero">
          <div className="hero-copy">
            <p className="hero-kicker">European Portuguese · Porto</p>
            <h1>
              Portuguese lessons
              <br />
              in Porto
            </h1>
            <p className="hero-lede">
              One-to-one European Portuguese with Inês. Practical, relaxed, and personal — useful from the very first
              lesson.
            </p>

            <div className="hero-cta-row">
              <Link className="button button-primary hero-primary" href="/book">
                Book a lesson
              </Link>
              <Link className="see-lessons-link" href="#lessons">
                See lessons
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>

            <ul className="hero-points" aria-label="How lessons work">
              {heroPoints.map((point) => {
                const Icon = point.icon;
                return (
                  <li key={point.label}>
                    <Icon aria-hidden="true" />
                    <span>{point.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <figure className="hero-visual" aria-hidden="true">
            <span className="hero-radial-mark" />
            <span className="hero-stamp">
              <span>Porto · Pessoal · Prático</span>
            </span>
          </figure>
        </div>

        <div className="hero-divider" aria-hidden="true">
          <svg viewBox="0 0 1200 60" preserveAspectRatio="none" role="presentation">
            <path className="wave-green" d="M0 34 C 220 6, 420 6, 620 30 S 1000 54, 1200 24" />
            <path className="wave-coral" d="M0 46 C 240 22, 460 22, 660 44 S 1020 64, 1200 40" />
            <circle className="dot-lavender" cx="1044" cy="20" r="9" />
            <circle className="dot-coral" cx="1096" cy="30" r="6" />
          </svg>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-heading">
        <div className="about-copy">
          <p className="section-kicker">Your teacher</p>
          <h2 id="about-heading">Meet Inês</h2>
          <p>
            Inês is a native Portuguese speaker, born and based in Porto, with a bachelor&apos;s degree in Languages,
            Literatures and Cultures. She teaches the European Portuguese people really speak in Portugal — the
            pronunciation, rhythm and everyday expressions you won&apos;t find in a textbook.
          </p>
          <p>
            Every lesson is one-to-one and shaped around you — your goals, your level and your pace — with gentle
            correction and plenty of real speaking practice. Explanations can be in Portuguese, English, or a mix, so
            you&apos;re never left behind.
          </p>
          <ul className="credential-list">
            {credentials.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <figure className="about-medallion" aria-hidden="true">
          <span className="hero-radial-mark" />
          <span className="about-stamp">
            <span>Native speaker in Porto</span>
          </span>
        </figure>
      </section>

      <section className="reasons-section" aria-labelledby="reasons-heading">
        <div className="section-head">
          <p className="section-kicker">Why learn with Inês</p>
          <h2 id="reasons-heading">Portuguese that actually sticks</h2>
        </div>
        <div className="reasons-grid">
          {reasons.map((reason) => {
            const Icon = reason.icon;
            return (
              <article className="reason-card" key={reason.title}>
                <span className="reason-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{reason.title}</h3>
                <p>{reason.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="steps-section" aria-labelledby="steps-heading">
        <div className="section-head">
          <p className="section-kicker">How it works</p>
          <h2 id="steps-heading">Start in three simple steps</h2>
        </div>
        <ol className="steps-grid">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li className="step-card" key={step.title}>
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="step-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="pricing-section" id="lessons" aria-labelledby="pricing-heading">
        <div className="pricing-intro">
          <p className="section-kicker">Lessons</p>
          <h2 id="pricing-heading">Simple, transparent pricing</h2>
          <p>Private lessons, tailored to you. Online or in person in Porto.</p>
          <span className="pricing-corner-mark" aria-hidden="true" />
        </div>

        <div className="pricing-grid">
          {lessonCards.map((card) => (
            <Link
              aria-label={`Book ${card.title} for ${card.price}`}
              className={card.featured ? "pricing-card is-featured" : "pricing-card"}
              href="/book"
              key={card.title}
            >
              {card.featured ? <span className="pricing-flag">Start here</span> : null}
              <h3>{card.title}</h3>
              <p className="price">
                <span>{card.price}</span>
              </p>
              <p className="card-duration">{card.duration}</p>
              <p className="card-note">{card.note}</p>
              <span className="pricing-card-action">
                Book now
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="closing-cta" aria-labelledby="closing-heading">
        <span className="closing-radial" aria-hidden="true" />
        <div className="closing-copy">
          <h2 id="closing-heading">Ready to start speaking Portuguese?</h2>
          <p>Book a trial lesson — 45 minutes, online or in Porto — and see how it feels.</p>
        </div>
        <div className="closing-action">
          <Link className="button button-primary" href="/book">
            Book a lesson
          </Link>
          <span className="closing-note">Secure online booking</span>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
