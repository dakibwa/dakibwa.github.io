import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Coffee, MessageCircle, PencilLine } from "lucide-react";

const teachingNotes = [
  {
    icon: MessageCircle,
    title: "Conversation first",
    text: "Lessons start with what you actually want to say, then build the grammar around that."
  },
  {
    icon: PencilLine,
    title: "Corrections that help",
    text: "Inês keeps the atmosphere gentle while making pronunciation, phrasing, and small mistakes easier to notice."
  },
  {
    icon: Coffee,
    title: "Portuguese for daily life",
    text: "Cafe orders, neighbours, appointments, travel, messages, and the little phrases that make Porto feel less distant."
  }
];

export default function Home() {
  return (
    <main className="home-page">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Portuguese with Inês home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Portuguese with Inês</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/faq">FAQ</Link>
        </nav>
        <Link className="button button-primary compact" href="/book">
          Book / manage
        </Link>
      </header>

      <section className="home-hero">
        <div className="hero-copy">
          <h1 aria-label="Portuguese that feels useful from day one.">
            <span aria-hidden="true">Portuguese </span>
            <span aria-hidden="true">that feels useful </span>
            <span aria-hidden="true">from day one.</span>
          </h1>
          <span className="hero-rule" aria-hidden="true" />
          <p>
            One-to-one lessons in Porto with Inês Dias Baía, built around real conversation, gentle corrections, and
            the small phrases that make daily life easier.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/book">
              Book or manage a lesson
            </Link>
            <Link className="button button-secondary" href="/faq">
              Read the FAQ
            </Link>
          </div>
        </div>

        <figure className="portrait-panel">
          <Image
            src="/visuals/ines-portrait-placeholder.png"
            alt="Placeholder portrait of a Portuguese teacher with bangs and translucent glasses"
            width={449}
            height={493}
            priority
          />
        </figure>
      </section>

      <section className="simple-section teaching-section">
        <div className="section-heading">
          <h2>How teaching feels</h2>
          <span className="section-flower" aria-hidden="true" />
        </div>
        <div className="note-list">
          {teachingNotes.map((item) => {
            const Icon = item.icon;
            return (
              <article className="note-row" key={item.title}>
                <span className="note-icon" aria-hidden="true">
                  <Icon size={25} />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <ChevronRight className="note-chevron" size={18} aria-hidden="true" />
              </article>
            );
          })}
        </div>
      </section>

      <section className="simple-section booking-callout">
        <div>
          <h2>Ready to get started?</h2>
          <p>
            Use the booking page to choose a time or manage an existing lesson.
          </p>
        </div>
        <Link className="button button-primary" href="/book">
          Book or manage a lesson
        </Link>
        <Image
          src="/visuals/porto-line-reference.png"
          alt="Blue line drawing of Porto"
          width={213}
          height={117}
          className="porto-line"
        />
      </section>
    </main>
  );
}
