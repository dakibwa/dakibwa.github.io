import Link from "next/link";
import { ArrowRight, BookOpen, Coffee, Sprout } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const lessonCards = [
  {
    title: "Trial lesson",
    price: "€25",
    duration: "45 minutes",
    icon: Coffee
  },
  {
    title: "1 lesson",
    price: "€45",
    duration: "60 minutes",
    icon: BookOpen
  },
  {
    title: "5 lessons",
    price: "€210",
    duration: "60 minutes each",
    icon: Sprout
  }
];

export default function Home() {
  return (
    <main className="home-page">
      <section className="hero-poster">
        <SiteHeader currentPage="home" />

        <div className="home-hero">
          <div className="hero-copy">
            <h1>Portuguese lessons in Porto</h1>
            <p>
              One-to-one European Portuguese lessons with Inês. Practical, relaxed and fully personalised for your goals.
            </p>

            <div className="hero-cta-row">
              <Link className="button button-primary compact hero-primary" href="/book">
                Book a lesson
              </Link>
              <Link className="see-lessons-link" href="#lessons">
                See lessons
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <figure className="hero-visual" aria-hidden="true">
            <span className="hero-radial-mark" />
          </figure>
        </div>

        <div
          className="hero-table-strip"
          role="img"
          aria-label="Portuguese lesson table with a notebook, blue pen, espresso cup, azulejo tile and Porto line art"
        />
      </section>

      <section className="pricing-section" id="lessons" aria-labelledby="pricing-heading">
        <div className="pricing-intro">
          <p className="section-kicker">Lessons</p>
          <h2 id="pricing-heading">Simple, transparent pricing</h2>
          <p>Private lessons, tailored to you. Online or in person in Porto.</p>
          <span className="pricing-corner-mark" aria-hidden="true" />
        </div>

        <div className="pricing-grid">
          {lessonCards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                aria-label={`Book ${card.title} for ${card.price}`}
                className="pricing-card"
                href="/book"
                key={card.title}
              >
                <span className="card-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{card.title}</h3>
                <p className="card-duration">{card.duration}</p>
                <p className="price">
                  <span>{card.price}</span>
                </p>
                <span className="pricing-card-action">Book now</span>
              </Link>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
