import type { Metadata } from "next";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BOOKING_PROVIDER,
  BOOKING_PROVIDER_NAME,
  CONTACT_WHATSAPP_URL,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  formatMoney
} from "@/lib/config";

export const metadata: Metadata = {
  title: "FAQ | Português com a Inês",
  description: "Answers about booking, payment, levels and changing a lesson."
};

const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);
const changeBookingInstructions =
  BOOKING_PROVIDER === "acuity"
    ? "Log in to the scheduler, or use the link in your confirmation email."
    : `Use the change-booking link in your confirmation email from ${BOOKING_PROVIDER_NAME}.`;

const faqSections = [
  {
    id: "booking",
    title: "Booking",
    questions: [
      {
        question: "How do I book a lesson?",
        answer:
          "Go to the booking page, pick a time that suits you, and pay. Square shows you the full details before you confirm."
      },
      {
        question: "What happens after I book?",
        answer:
          "An email arrives with the lesson details and a link you can use to change or cancel it."
      },
      {
        question: "Can I book more than one lesson?",
        answer:
          "Yes, book as many as you like. If you’d rather have the same time every week, message me and we’ll set it up."
      }
    ]
  },
  {
    id: "lessons",
    title: "Lessons",
    questions: [
      {
        question: "What are the lessons like?",
        answer:
          "We talk, mostly. I correct you as we go, and explain the grammar when it’s the thing tripping you up."
      },
      {
        question: "Do I need to prepare anything?",
        answer:
          "No. Turn up with a question, a situation you’re dreading, or nothing at all."
      },
      {
        question: "Is this European or Brazilian Portuguese?",
        answer:
          "European. The Portuguese you’ll hear on the street in Porto."
      }
    ]
  },
  {
    id: "location",
    title: "Location",
    questions: [
      {
        question: "Where do lessons take place?",
        answer:
          "Online, or in person in Porto. You choose the format when you book, and it’s confirmed before you pay."
      },
      {
        question: "Can I learn online if I’m not in Porto?",
        answer:
          "Yes. Online lessons run exactly the same way, wherever you are."
      }
    ]
  },
  {
    id: "payment",
    title: "Payment",
    questions: [
      {
        question: "How do I pay?",
        answer: `By card, through ${BOOKING_PROVIDER_NAME}, at the time you book. Your slot is confirmed once the payment goes through.`
      },
      {
        question: "How much does a lesson cost?",
        answer:
          "The prices are all on the lessons page, and Square shows you the total before you pay."
      }
    ]
  },
  {
    id: "rescheduling",
    title: "Rescheduling",
    questions: [
      {
        question: "Can I reschedule?",
        answer: `${changeBookingInstructions} Move to any time that’s free. It costs nothing if you change it the day before or earlier; on the day itself there’s a ${sameDayFee} fee.`
      },
      {
        question: `When does the ${sameDayFee} fee apply?`,
        answer:
          "Only if you change the lesson on the day it’s due, counting by Porto time. Any earlier and it’s free."
      },
      {
        question: "Can I cancel?",
        answer:
          "There’s a cancellation link in your confirmation email. If you’re not sure what to do, message me first."
      }
    ]
  },
  {
    id: "levels",
    title: "Levels",
    questions: [
      {
        question: "What level do I need to be?",
        answer:
          "Any. From never having said a word, to reading Portuguese fine but freezing when somebody answers back."
      },
      {
        question: "Can lessons match my goals?",
        answer:
          "That’s the point of one to one. Tell me what you need Portuguese for and we’ll work on that."
      },
      {
        question: "Can explanations be in English?",
        answer:
          "Yes. English, Portuguese, or a mix. We find a balance that works and shift it as you improve."
      }
    ]
  }
];

export default function FAQPage() {
  return (
    <>
      <SiteHeader currentPage="faq" />

      <main className="faq-page" id="main-content">
        <section className="faq-hero" aria-labelledby="faq-title">
          <div>
            <p className="eyebrow">Practical stuff</p>
            <h1 id="faq-title">Questions<br />before booking?</h1>
            <p>Booking, money, and what happens when life gets in the way.</p>
          </div>
          <AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-hero__mark" priority />
        </section>

        <section className="faq-reference" aria-label="Frequently asked questions">
          <nav className="faq-index" aria-label="FAQ categories">
            <p className="eyebrow">Index</p>
            <ol>
              {faqSections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#faq-${section.id}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
            <AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-index__answer-index" />
          </nav>

          <div className="faq-groups">
            {faqSections.map((section, sectionIndex) => (
              <section className="faq-group" id={`faq-${section.id}`} key={section.id}>
                <header className="faq-group__header">
                  <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                  <h2>{section.title}</h2>
                </header>
                {section.questions.map((item, questionIndex) => (
                  <details
                    className="faq-row"
                    key={item.question}
                    open={sectionIndex === 0 && questionIndex === 0}
                  >
                    <summary>
                      <span>{item.question}</span>
                      <span className="faq-row__symbol" aria-hidden="true" />
                    </summary>
                    <div className="faq-row__answer">
                      <p>{item.answer}</p>
                    </div>
                  </details>
                ))}
              </section>
            ))}
          </div>
        </section>

        <section className="faq-contact">
          <p className="eyebrow">Not sure yet?</p>
          <h2>Ask me before you book.</h2>
          <a className="button button--coral" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
            Message on WhatsApp
          </a>
          <Link className="text-action faq-contact__book" href="/book">
            Go to booking
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
