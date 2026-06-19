import Image from "next/image";
import Link from "next/link";

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
          Book a lesson
        </Link>
      </header>

      <section className="home-hero">
        <div className="hero-copy">
          <h1>Portuguese lessons in Porto with Inês.</h1>
          <span className="hero-rule" aria-hidden="true" />
          <p>
            Friendly one-to-one lessons for everyday conversations, messages, appointments, and feeling more at home in
            Portuguese.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/book">
              Book a lesson
            </Link>
            <Link className="button button-secondary" href="/faq">
              Read FAQ
            </Link>
          </div>
        </div>

        <figure className="portrait-panel">
          <Image
            src="/visuals/ines-dias-baia-portrait.png"
            alt="Inês Dias Baía writing during a Portuguese lesson at a desk"
            width={987}
            height={793}
            priority
          />
          <figcaption className="portrait-note">
            Inês&apos;s approach: calm lessons, useful language, and Portuguese connected to real life.
          </figcaption>
        </figure>
      </section>

      <section className="context-line" aria-label="Who lessons are for">
        <p>For beginners, returners, and Porto newcomers who want Portuguese for ordinary days, not textbook performance.</p>
      </section>

      <section className="simple-section lesson-section">
        <div>
          <h2>What lessons are like</h2>
        </div>
        <div className="lesson-copy">
          <p className="lesson-lead">We start with what you need to say this week.</p>
          <p>
            A lesson might begin with a message you need to send, a conversation you avoided, or a phrase you keep
            half-remembering in a cafe.
          </p>
          <ol className="lesson-steps">
            <li>
              <strong>You bring the situation.</strong>
              <span>Cafes, neighbours, appointments, travel, messages, small talk, or whatever came up that week.</span>
            </li>
            <li>
              <strong>We make it speakable.</strong>
              <span>Inês helps with phrasing, rhythm, pronunciation, and grammar only when it makes the sentence clearer.</span>
            </li>
            <li>
              <strong>You leave with something to reuse.</strong>
              <span>A few natural phrases, a clearer ear for mistakes, and less hesitation the next time it happens.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="simple-section booking-callout">
        <div>
          <h2>Ready to start?</h2>
          <p>Choose a time, book a lesson, or manage an existing booking.</p>
        </div>
        <Link className="button button-primary" href="/book">
          Book a lesson
        </Link>
        <Link className="quiet-link" href="/faq">
          Questions first? Read FAQ
        </Link>
      </section>
    </main>
  );
}
