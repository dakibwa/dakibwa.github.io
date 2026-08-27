import type { Metadata } from "next";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  CONTACT_WHATSAPP_URL,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  formatMoney
} from "@/lib/config";
import { trialLesson } from "@/lib/lesson-products";

export const metadata: Metadata = {
  title: "FAQ | Português com a Inês",
  description:
    "Answers for anyone nervous about speaking, plus levels, booking, payment and changing a lesson."
};

const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);
const changeBookingInstructions =
  "Use the link in your confirmation email. It opens your booking on this site, where you can move it or cancel it yourself.";

const faqSections = [
  {
    id: "nerves",
    title: "Feeling nervous",
    questions: [
      {
        question: "I’m nervous about speaking. Is that normal?",
        answer:
          "It’s the single most common thing people tell me in a first lesson. Speaking out loud in a new language feels exposing, however much grammar you know. We go at whatever speed makes it easier."
      },
      {
        question: "What if I freeze and can’t say anything?",
        answer:
          "Then I help you out and we carry on. Nobody is timing you, and there’s no class watching. Long pauses are part of learning to speak, not a sign it’s going badly."
      },
      {
        question: "What if I make a lot of mistakes?",
        answer:
          "You will, and that’s useful. Your mistakes tell me exactly what to work on next. I correct you as we go, though not every single slip, because that stops a conversation dead."
      },
      {
        question: "I’ve tried before and gave up. Will this be different?",
        answer:
          "I can’t promise that. What I can say is that most people who stall were learning alone, with an app or a book and nobody to answer back. An hour of talking to a real person is a different thing."
      }
    ]
  },
  {
    id: "lessons",
    title: "In the lesson",
    questions: [
      {
        question: "What happens in a lesson?",
        answer:
          "We talk, mostly. You bring something you want to be able to say, or I bring something, and we work through it out loud. I correct you as we go, and explain the grammar when it’s the thing tripping you up."
      },
      {
        question: "What if we run out of things to talk about?",
        answer:
          "That’s my job to solve, not yours. I’ll always have something ready. Turning up with nothing in mind is completely fine."
      },
      {
        question: "Will you speak only Portuguese? I won’t understand.",
        answer:
          "Not at the start, no. We use as much English as you need, and less of it as you go. You will never be left sitting there with no idea what’s happening."
      },
      {
        question: "Do I need to prepare anything?",
        answer:
          "No. Turn up with a question, a situation you’re dreading, or nothing at all."
      },
      {
        question: "Is there homework?",
        answer:
          "Only if you want it. Ask and I’ll give you something to practise between lessons. If your week gets away from you, come anyway and we’ll use the hour."
      }
    ]
  },
  {
    id: "levels",
    title: "Level and language",
    questions: [
      {
        question: "What level do I need to be?",
        answer:
          "Any. From never having said a word, to reading Portuguese fine but freezing when somebody answers back."
      },
      {
        question: "Am I too old to start?",
        answer:
          "No. Adults are usually better than children at understanding how a language works. What you need is more practice saying things out loud, which is exactly what an hour of talking gives you."
      },
      {
        question: "How long until I can hold a conversation?",
        answer:
          "That depends on where you start and how much you practise, so anyone who gives you a number is guessing. What I can tell you is that you’ll say something real in Portuguese in the first lesson."
      },
      {
        question: "Is this European or Brazilian Portuguese?",
        answer:
          "European. The Portuguese you’ll hear on the street in Porto, including all the vowels we swallow."
      },
      {
        question: "I learned Brazilian Portuguese. Is that a problem?",
        answer:
          "Not at all, and you’ll be understood here. We’d work on the differences in sound and vocabulary, and you keep whatever you like from it."
      },
      {
        question: "Can explanations be in English?",
        answer:
          "Yes. English, Portuguese, or a mix. We find a balance that works and shift it as you improve."
      }
    ]
  },
  {
    id: "location",
    title: "Online or in Porto",
    questions: [
      {
        question: "Where do lessons take place?",
        answer:
          "Online, or in person in Porto. You choose the format when you book, and it’s confirmed before you pay."
      },
      {
        question: "What do I need for an online lesson?",
        answer:
          "Not much. Lessons run on Google Meet: I’ll send you the link, it opens straight in your browser, and there’s nothing to install beforehand. Headphones help more than anything else."
      },
      {
        question: "Do online lessons work as well as in person?",
        answer:
          "For one-to-one talking, yes. You get the same hour and the same attention either way, wherever in the world you are."
      }
    ]
  },
  {
    id: "booking",
    title: "Booking",
    questions: [
      {
        question: "How do I book a lesson?",
        answer:
          "Go to the booking page, choose the lesson you want, pick a time that suits you, and add your details. You'’'ll see the full details before you confirm."
      },
      {
        question: "What happens after I book?",
        answer:
          "An email arrives straight away with the lesson details, a calendar invitation, and a link you can use to move or cancel it yourself at any time."
      },
      {
        question: "Do I have to commit to a block of lessons?",
        answer:
          "No. There’s no package to buy and no minimum. Book one, see how it goes, book another if you want to. If you’d rather hold the same time every week, message me and we’ll set that up."
      }
    ]
  },
  {
    id: "payment",
    title: "Payment",
    questions: [
      {
        question: "How do I pay?",
        answer:
          "You don’t pay when you book — your slot is held as soon as you confirm it. Inês will arrange payment with you directly."
      },
      {
        question: "How much does a lesson cost?",
        answer:
          "The prices are all on the lessons page, and the price of the lesson you’ve chosen is shown before you confirm."
      },
      {
        question: "What if the trial lesson isn’t for me?",
        answer: `Then you’ve spent ${trialLesson.price} on an hour of Portuguese and we leave it there. No follow-up and no pressure. A trial lesson is you deciding, not me selling.`
      }
    ]
  },
  {
    id: "rescheduling",
    title: "Changing a lesson",
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
      },
      {
        question: "What if I don’t turn up?",
        answer:
          "Cancelling is always better than not coming — even on the day, that’s only the €5 fee. If you don’t come and haven’t said anything, it’s half the price of the lesson, because the time was held for you and nobody else could take it. If something happened, message me: I’d rather sort it out than charge you.",
        // Placed under cancelling rather than payment on purpose — the answer is
        // mostly "cancel instead", and that is the thing worth reading.
      },
      {
        question: "What if I need to stop for a while?",
        answer:
          "Then you stop. There’s no subscription and nothing to cancel, so a gap costs you nothing. Book again whenever you’re ready."
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
            <p className="eyebrow">Ask anything</p>
            <h1 id="faq-title">Questions<br />before booking?</h1>
            <p>The nervous ones first. Then booking, money, and what happens when life gets in the way.</p>
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
