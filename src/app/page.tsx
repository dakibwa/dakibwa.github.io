import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Check, Coffee, Heart, Leaf, MapPin, MessageCircle, Star, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { publicAssetPath } from "@/lib/paths";

const lessonCards = [
  {
    title: "Trial lesson",
    description: "Perfect if you're just getting started.",
    price: "€25",
    duration: "45 minutes",
    icon: Leaf,
    features: ["Get to know each other", "Talk about your goals", "See if it's a good fit"]
  },
  {
    title: "60-minute lesson",
    description: "Regular weekly learning at your pace.",
    price: "€45",
    duration: "60 minutes",
    icon: Coffee,
    features: ["Personalised lessons", "Useful vocabulary and expressions", "Feedback and support"]
  },
  {
    title: "Package of 5",
    description: "Better rhythm, more progress.",
    price: "€210",
    duration: "5 x 60 minutes",
    icon: Star,
    features: ["Use within 3 months", "Save compared to single lessons", "Flexible scheduling"]
  }
];

export default function Home() {
  return (
    <main className="home-page">
      <SiteHeader currentPage="home" />

      <section className="home-hero">
        <div className="hero-copy">
          <h1>
            <span className="hero-title-line">Portuguese</span>
            <span className="hero-title-line">lessons in Porto</span>
            <span className="hero-title-line">
              with <span>Inês.</span>
            </span>
          </h1>
          <span className="hero-rule" aria-hidden="true" />
          <p>
            One-to-one lessons in European Portuguese, adapted to your life in Porto.
          </p>
          <p>Beginner, returning or just want to speak with more confidence? You&apos;re in the right place.</p>

          <div className="hero-cta-row">
            <Link className="button button-primary compact hero-primary" href="/book">
              Book a lesson
            </Link>
            <p className="handwritten-note">First lesson from €25</p>
          </div>

          <div className="hero-benefits" aria-label="Lesson highlights">
            <div>
              <span aria-hidden="true">
                <MapPin />
              </span>
              <p>
                <strong>In-person in Porto</strong>
                <small>or online, wherever you are</small>
              </p>
            </div>
            <div>
              <span aria-hidden="true">
                <Calendar />
              </span>
              <p>
                <strong>Book, pay and manage online</strong>
                <small>Reschedule anytime</small>
              </p>
            </div>
          </div>
        </div>

        <figure className="hero-visual">
          <Image
            src={publicAssetPath("/visuals/ines-dias-baia-hero-green.png")}
            alt="Inês Dias Baía writing during a Portuguese lesson at a desk"
            width={547}
            height={545}
            priority
          />
        </figure>
      </section>

      <section className="home-intro-card" aria-label="Who lessons are for">
        <Image src={publicAssetPath("/visuals/porto-line.svg")} alt="" width={180} height={75} aria-hidden="true" />
        <p>For beginners, returners, and Porto newcomers who want Portuguese for everyday life.</p>
        <span className="handwritten-note">♡ Vamos falar português!</span>
      </section>

      <section className="pricing-section" aria-labelledby="pricing-heading">
        <div className="section-heading">
          <h2 id="pricing-heading">Lessons &amp; pricing</h2>
          <span className="pricing-ornament" aria-hidden="true" />
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
                <div className="card-topline">
                  <span className="card-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </div>
                </div>
                <p className="price">
                  <span>{card.price}</span>
                  <small>{card.duration}</small>
                </p>
                <ul>
                  {card.features.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <span className="pricing-card-action">
                  Book this
                  <ArrowRight aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="proof-section" aria-label="Student feedback and lesson style">
        <div className="testimonial">
          <Image
            src={publicAssetPath("/visuals/ines-testimonial-avatar-mug.png")}
            alt="Inês smiling with a mug in a Portuguese lesson room"
            width={136}
            height={136}
          />
          <div>
            <p className="stars" aria-label="Five star review">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star aria-hidden="true" fill="currentColor" key={index} />
              ))}
            </p>
            <blockquote>
              Inês is patient, organised and makes every lesson feel useful and enjoyable. I feel much more confident
              speaking Portuguese now!
            </blockquote>
            <cite>— Tom, London</cite>
          </div>
        </div>

        <div className="feature-strip" aria-label="Lesson features">
          <div>
            <Users aria-hidden="true" />
            <span>One-to-one lessons</span>
          </div>
          <div>
            <MessageCircle aria-hidden="true" />
            <span>English or Portuguese</span>
          </div>
          <div>
            <Heart aria-hidden="true" />
            <span>A relaxed and friendly approach</span>
          </div>
        </div>
      </section>

      <div className="azulejo-band" aria-hidden="true" />
    </main>
  );
}
