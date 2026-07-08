import Link from "next/link";
import { ArrowRight, MapPin, MonitorSmartphone, Sparkles } from "lucide-react";
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

      <SiteFooter />
    </main>
  );
}
