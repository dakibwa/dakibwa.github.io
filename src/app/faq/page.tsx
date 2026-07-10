"use client";

import Image from "next/image";
import { useEffect, useState, type MouseEvent } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  CreditCard,
  MapPin,
  MessageCircle
} from "lucide-react";
import {
  BOOKING_PROVIDER,
  BOOKING_PROVIDER_NAME,
  CONTACT_WHATSAPP_URL,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  formatMoney
} from "@/lib/config";
import { publicAssetPath } from "@/lib/paths";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const changeBookingInstructions =
  BOOKING_PROVIDER === "acuity"
    ? "Log in from the booking scheduler or use the link in your confirmation email."
    : `Open your confirmation email and use the reschedule or cancel link. If you cannot find it, search for "Português with Inês" or "${BOOKING_PROVIDER_NAME}".`;
const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);
const changeBookingAnswer = `${changeBookingInstructions} You can move your lesson to any available time. It is free before the lesson day; a ${sameDayFee} fee applies if you reschedule on the day itself.`;

const faqSections = [
  {
    id: "booking",
    title: "Booking",
    icon: CalendarDays,
    questions: [
      {
        question: "How do I book a lesson?",
        answer: "Use the booking page to choose a live available time, answer a few lesson questions, and confirm online."
      },
      {
        question: "What happens after I book?",
        answer:
          "You will receive a confirmation email with the lesson details and any links you need to manage the booking."
      },
      {
        question: "Can I book more than one lesson?",
        answer: "Yes. You can book another time after confirming, or ask Inês about a regular weekly rhythm."
      }
    ]
  },
  {
    id: "lessons",
    title: "Lessons",
    icon: MessageCircle,
    questions: [
      {
        question: "What are the lessons like?",
        answer:
          "Lessons are one-to-one, practical and conversational, with gentle correction and useful Portuguese for real situations."
      },
      {
        question: "Do I need to prepare anything?",
        answer: "No special preparation is needed. Bring your questions, goals, or situations you want to practise."
      },
      {
        question: "Do you teach complete beginners?",
        answer: "Yes. Complete beginners are welcome, and lessons can start from simple everyday Portuguese."
      },
      {
        question: "Is this European Portuguese or Brazilian Portuguese?",
        answer: "Lessons focus on European Portuguese, especially the kind you will hear and use in Porto."
      },
      {
        question: "Can the lesson be in English?",
        answer: "Yes. Explanations can be in English, Portuguese, or a mix depending on your confidence."
      }
    ]
  },
  {
    id: "location",
    title: "Location / online",
    icon: MapPin,
    questions: [
      {
        question: "Where do lessons take place?",
        answer: "Lessons are based in Porto. The booking form will show the confirmed location details before you book."
      },
      {
        question: "Can I do lessons online if I’m not in Porto?",
        answer: "Yes. Online lessons are available if you are not in Porto or need a more flexible option."
      }
    ]
  },
  {
    id: "payment",
    title: "Payment",
    icon: CreditCard,
    questions: [
      {
        question: "How do I pay?",
        answer: "Any lesson payment or rescheduling fee due is shown and handled securely in Square."
      },
      {
        question: "How much does a lesson cost?",
        answer: `The first lesson is ${formatMoney()}. You will see the final payment step before confirming.`
      }
    ]
  },
  {
    id: "rescheduling",
    title: "Rescheduling",
    icon: Clock3,
    questions: [
      {
        question: "Can I reschedule?",
        answer: changeBookingAnswer
      },
      {
        question: `When does the ${sameDayFee} rescheduling fee apply?`,
        answer:
          `Only when you make the change on the same calendar day as the lesson, using Porto time. Changes made on any earlier day are free.`
      },
      {
        question: "Can I cancel?",
        answer:
          "Use the cancellation link in your confirmation email. If you are unsure, send Inês a message before changing anything."
      }
    ]
  },
  {
    id: "levels",
    title: "Levels",
    icon: BarChart3,
    questions: [
      {
        question: "What level do I need to be?",
        answer: "Any level is welcome. Lessons can start from the basics or pick up from what you already know."
      },
      {
        question: "Can lessons match my goals?",
        answer: "Yes. Inês can adapt the lesson around travel, daily life in Porto, pronunciation, grammar, or conversation."
      }
    ]
  }
];

const faqNavItems = faqSections.map((section) => ({
  href: `#faq-${section.id}`,
  icon: section.icon,
  label: section.title === "Location / online" ? "Location" : section.title,
  sectionId: section.id
}));

function FAQContactPrompt() {
  return (
    <div className="faq-stack-contact">
      <span className="faq-stack-contact-icon" aria-hidden="true">
        <MessageCircle />
      </span>
      <div className="faq-stack-contact-copy">
        <p className="faq-stack-kicker">Still unsure?</p>
        <p>Send Inês a WhatsApp message before booking.</p>
      </div>
      <a className="faq-contact-button" href={CONTACT_WHATSAPP_URL} rel="noreferrer" target="_blank">
        <span className="faq-whatsapp-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" focusable="false">
            <path d="M16.03 3.2a12.7 12.7 0 0 0-10.8 19.37L3.9 28.8l6.38-1.28A12.7 12.7 0 1 0 16.03 3.2Zm0 22.05c-1.78 0-3.52-.51-5.03-1.49l-.36-.23-3.78.76.78-3.68-.24-.38a9.34 9.34 0 1 1 8.63 5.02Zm5.11-7c-.28-.14-1.66-.82-1.92-.91-.26-.09-.45-.14-.64.14-.19.28-.73.91-.9 1.1-.17.19-.33.21-.61.07-.28-.14-1.18-.43-2.25-1.38-.83-.74-1.39-1.66-1.55-1.94-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.49.07-.75.35-.26.28-.99.97-.99 2.37s1.02 2.75 1.16 2.94c.14.19 2 3.05 4.85 4.28.68.29 1.2.46 1.61.59.68.22 1.29.19 1.78.12.54-.08 1.66-.68 1.9-1.33.23-.65.23-1.21.16-1.33-.07-.12-.25-.19-.53-.33Z" />
          </svg>
        </span>
        <span>Message on WhatsApp</span>
      </a>
    </div>
  );
}

export default function FAQPage() {
  const [activeSection, setActiveSection] = useState("booking");
  const [openQuestions, setOpenQuestions] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const sectionIds = faqSections.map((section) => section.id);
    const hashSection = window.location.hash.replace("#faq-", "");

    if (sectionIds.includes(hashSection)) {
      setActiveSection(hashSection);
    }

    let frame = 0;

    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const measuredSections = sectionIds
          .map((id) => {
            const element = document.getElementById(`faq-${id}`);
            if (!element) {
              return null;
            }

            const rect = element.getBoundingClientRect();
            return { bottom: rect.bottom, id, top: rect.top };
          })
          .filter(Boolean) as Array<{ bottom: number; id: string; top: number }>;

        if (measuredSections.length === 0) {
          return;
        }

        const activationLine = 170;
        const containingSection = measuredSections.find(
          (section) => section.top <= activationLine && section.bottom >= activationLine
        );
        const closestSection = measuredSections.reduce((closest, section) => {
          const closestDistance = Math.abs(closest.top - activationLine);
          const sectionDistance = Math.abs(section.top - activationLine);

          return sectionDistance < closestDistance ? section : closest;
        }, measuredSections[0]);
        const currentSection =
          containingSection ?? closestSection;

        if (currentSection) {
          setActiveSection(currentSection.id);
        }
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  const handleNavClick = (sectionId: string, href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setActiveSection(sectionId);

    const target = document.getElementById(`faq-${sectionId}`);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    target?.scrollIntoView({
      block: "start",
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });

    window.history.replaceState(null, "", href);
  };

  const toggleQuestion = (questionId: string) => {
    setOpenQuestions((current) => {
      const next = new Set(current);

      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }

      return next;
    });
  };

  return (
    <main className="faq-page">
      <SiteHeader currentPage="faq" />

      <section className="faq-hero" aria-labelledby="faq-title">
        <div className="faq-hero-inner">
          <div className="faq-hero-copy">
            <h1 id="faq-title">Questions before booking?</h1>
            <p>Everything you need to know about lessons, payment, rescheduling, location, and what to expect.</p>
          </div>
          <figure className="faq-hero-scene" aria-hidden="true">
            <Image
              className="brand-card-sticker"
              src={publicAssetPath("/visuals/business-card-blue.png")}
              alt=""
              width={1000}
              height={663}
              sizes="(max-width: 900px) 0px, 320px"
            />
          </figure>
        </div>
      </section>

      <section className="faq-content-shell" aria-label="Frequently asked questions">
        <FAQContactPrompt />

        <nav className="faq-tabs" aria-label="FAQ sections">
          {faqNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.sectionId;

            return (
              <a
                aria-current={isActive ? "location" : undefined}
                className={isActive ? "is-active" : undefined}
                href={item.href}
                key={item.sectionId}
                onClick={handleNavClick(item.sectionId, item.href)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="faq-section-stack">
          {faqSections.map((section) => {
            const Icon = section.icon;
            return (
              <section className="faq-section-group" id={`faq-${section.id}`} key={section.id}>
                <div className="faq-section-heading">
                  <span aria-hidden="true">
                    <Icon />
                  </span>
                  <h2>{section.title}</h2>
                </div>

                <div className="faq-accordion">
                  {section.questions.map((item, questionIndex) => {
                    const questionId = `${section.id}-${questionIndex}`;
                    const buttonId = `faq-${questionId}-button`;
                    const answerId = `faq-${questionId}-answer`;
                    const isOpen = openQuestions.has(questionId);

                    return (
                      <div className="faq-item" data-open={isOpen} key={item.question}>
                        <button
                          aria-controls={answerId}
                          aria-expanded={isOpen}
                          className="faq-question-button"
                          id={buttonId}
                          onClick={() => toggleQuestion(questionId)}
                          type="button"
                        >
                          <span className="faq-question">{item.question}</span>
                          <ChevronDown aria-hidden="true" />
                        </button>
                        <div
                          aria-hidden={!isOpen}
                          aria-labelledby={buttonId}
                          className="faq-answer-shell"
                          id={answerId}
                          role="region"
                        >
                          <div className="faq-answer">
                            <p>{item.answer}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
