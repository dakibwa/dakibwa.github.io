import type { Metadata } from "next";
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
  description: "Answers about booking, lessons, location, payment, rescheduling, and levels."
};

const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);
const changeBookingInstructions =
  BOOKING_PROVIDER === "acuity"
    ? "Log in from the scheduler or use the link in your confirmation email."
    : `Use the change-booking link in your confirmation email from ${BOOKING_PROVIDER_NAME}.`;

const faqSections = [
  {
    id: "booking",
    title: "Booking",
    questions: [
      {
        question: "How do I book a lesson?",
        answer:
          "Open the Booking page, choose a live time in Square, and follow the secure confirmation steps. Square shows the final appointment details before you confirm."
      },
      {
        question: "What happens after I book?",
        answer:
          "You will receive a confirmation email with the lesson details and the link you can use to manage the appointment."
      },
      {
        question: "Can I book more than one lesson?",
        answer:
          "Yes. You can book another available time after confirming, or ask Inês about arranging a regular rhythm."
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
          "Lessons are one-to-one, practical and conversational, with gentle correction and useful European Portuguese for real situations."
      },
      {
        question: "Do I need to prepare anything?",
        answer:
          "No special preparation is needed. Bring your questions, goals, or a situation you would like to practise."
      },
      {
        question: "Is this European or Brazilian Portuguese?",
        answer:
          "Lessons focus on European Portuguese, especially the kind you will hear and use in Porto."
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
          "Lessons are available online or in person in Porto. The booking route shows the format and confirmed details before you book."
      },
      {
        question: "Can I learn online if I am not in Porto?",
        answer:
          "Yes. Online lessons are available wherever you are and follow the same one-to-one approach."
      }
    ]
  },
  {
    id: "payment",
    title: "Payment",
    questions: [
      {
        question: "How do I pay?",
        answer: `${BOOKING_PROVIDER_NAME} takes the full lesson payment securely when you book. Your appointment is confirmed after checkout is complete.`
      },
      {
        question: "How much does a lesson cost?",
        answer:
          "The lesson page lists the current site offers. Square remains the final source for the appointment and total you are confirming."
      }
    ]
  },
  {
    id: "rescheduling",
    title: "Rescheduling",
    questions: [
      {
        question: "Can I reschedule?",
        answer: `${changeBookingInstructions} You can move to another available time. Changes are free before the lesson day; a ${sameDayFee} fee applies on the day itself.`
      },
      {
        question: `When does the ${sameDayFee} fee apply?`,
        answer:
          "Only when you make the change on the same calendar day as the lesson, using Porto time. Changes made on an earlier day are free."
      },
      {
        question: "Can I cancel?",
        answer:
          "Use the cancellation link in your confirmation email. If you are unsure, message Inês before changing anything."
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
          "Any level is welcome. Lessons can begin with the basics or build from the Portuguese you already know."
      },
      {
        question: "Can lessons match my goals?",
        answer:
          "Yes. Inês adapts lessons around travel, daily life, work, pronunciation, grammar, exams, or conversation."
      },
      {
        question: "Can explanations be in English?",
        answer:
          "Yes. Explanations can be in English, Portuguese, or a mix, depending on your confidence."
      }
    ]
  }
];

export default function FAQPage() {
  return (
    <main className="faq-page">
      <SiteHeader currentPage="faq" />

      <section className="faq-hero" aria-labelledby="faq-title">
        <div>
          <p className="eyebrow">Good to know</p>
          <h1 id="faq-title">Questions<br />before booking?</h1>
          <p>Lessons, payment, location and what to expect.</p>
        </div>
        <AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-hero__mark" />
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
        <p className="eyebrow">Still unsure?</p>
        <h2>Ask Inês before you book.</h2>
        <a className="button button--coral" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
          Message on WhatsApp
        </a>
      </section>

      <SiteFooter />
    </main>
  );
}
