import Link from "next/link";
import { BOOKING_PROVIDER, BOOKING_PROVIDER_NAME, formatMoney } from "@/lib/config";

const changeBookingAnswer =
  BOOKING_PROVIDER === "acuity"
    ? "Log in from the booking scheduler to review upcoming and past lessons. You can reschedule or cancel there when Inês has enabled those options, and the confirmation email will also include booking links."
    : `Open your confirmation email and use the reschedule or cancel link. If you cannot find it, search for "Portuguese with Inês" or "${BOOKING_PROVIDER_NAME}".`;

const faqs = [
  {
    question: "Who are the lessons for?",
    answer:
      "Adults who want practical Portuguese for real life in Porto: newcomers, travellers, remote workers, and anyone who wants to speak more naturally."
  },
  {
    question: "Do I need to know any Portuguese already?",
    answer:
      "No. Beginners are welcome, and lessons can also help people who already know some Portuguese but want clearer conversation practice."
  },
  {
    question: "What happens in a lesson?",
    answer:
      "You talk about useful situations, practise phrases out loud, and get gentle corrections on pronunciation, grammar, and word choice as they become relevant."
  },
  {
    question: "Where do lessons happen?",
    answer:
      "Lessons are based in Porto. The booking form will show the confirmed location details before you book."
  },
  {
    question: "How do I book?",
    answer:
      "Use the booking page to choose a live available time, answer a few lesson questions, and pay before the lesson is confirmed."
  },
  {
    question: "How do I reschedule or cancel?",
    answer: changeBookingAnswer
  },
  {
    question: "How much is the first lesson?",
    answer: `The first lesson is ${formatMoney()}. You'll see the final payment step before confirming.`
  }
];

export default function FAQPage() {
  return (
    <main>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Portuguese with Inês home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Portuguese with Inês</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/faq" aria-current="page">
            FAQ
          </Link>
        </nav>
        <Link className="button button-primary compact" href="/book">
          Book a lesson
        </Link>
      </header>

      <section className="faq-hero">
        <h1>Questions before you book.</h1>
        <p>
          The basics, kept short: who lessons are for, what the booking flow does, and how to manage a lesson once it is
          confirmed.
        </p>
        <div className="faq-hero-actions">
          <Link className="button button-primary" href="/book">
            Book a lesson
          </Link>
          <a className="quiet-link" href="#questions">
            Or read the details below
          </a>
        </div>
      </section>

      <section className="faq-list" id="questions" aria-label="Frequently asked questions">
        {faqs.map((item) => (
          <article className="faq-item" key={item.question}>
            <h2>{item.question}</h2>
            <p>{item.answer}</p>
          </article>
        ))}
      </section>

      <section className="simple-section faq-cta">
        <div>
          <h2>Ready to choose a time?</h2>
          <p>Book a lesson or manage an existing booking from the same place.</p>
        </div>
        <Link className="button button-primary" href="/book">
          Book a lesson
        </Link>
      </section>
    </main>
  );
}
