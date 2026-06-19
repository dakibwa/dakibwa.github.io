import Link from "next/link";
import { formatMoney } from "@/lib/config";

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
      "Lessons are based in Porto. The current booking copy references Epoca Cafe on Rua do Rosario; Cal.com will show the confirmed location details when you book."
  },
  {
    question: "How do I book?",
    answer:
      "Use the book/manage page. Cal.com shows live availability, collects the lesson details, and handles payment before the booking is confirmed."
  },
  {
    question: "How do I reschedule or cancel?",
    answer:
      "Use the reschedule or cancel links in your Cal.com confirmation email. That keeps the calendar, payment record, and confirmation details in one place."
  },
  {
    question: "How much is the first lesson?",
    answer: `The current first-lesson price is ${formatMoney()}. The final payment step happens inside Cal.com.`
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
          Book / manage
        </Link>
      </header>

      <section className="faq-hero">
        <h1>Questions before you book.</h1>
        <p>
          The basics, kept short: who lessons are for, what the booking flow does, and how to manage a lesson once it is
          confirmed.
        </p>
      </section>

      <section className="faq-list" aria-label="Frequently asked questions">
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
          Book / manage
        </Link>
      </section>
    </main>
  );
}
