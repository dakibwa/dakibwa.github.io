import type { Metadata } from "next";
import Link from "next/link";
import { ConversationBurst, PlantMark, SunMark, WaveMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Approach | Português com a Inês",
  description: "A calm, practical, one-to-one approach to learning European Portuguese."
};

const approachItems = [
  {
    title: "Real European Portuguese",
    body: "Pronunciation, rhythm and everyday expressions — the language you will actually hear in Portugal.",
    icon: PlantMark
  },
  {
    title: "Built around you",
    body: "Travel, daily life, work, exams or moving to Portugal. Your goals set the direction.",
    icon: WaveMark
  },
  {
    title: "Relaxed and practical",
    body: "Conversation-led practice with gentle correction, clear explanations and space to build confidence.",
    icon: SunMark
  }
];

export default function ApproachPage() {
  return (
    <main className="approach-page">
      <SiteHeader currentPage="approach" />

      <section className="approach-composition" aria-labelledby="approach-title">
        <div className="approach-intro">
          <h1 id="approach-title">
            A calm,<br />
            practical<br />
            way <em>to</em><br />
            <em>learn.</em>
          </h1>
          <div className="editorial-rule editorial-rule--green" aria-hidden="true" />
          <p>One-to-one lessons shaped around your goals, level and pace.</p>
          <PlantMark className="approach-intro__plant" />
        </div>

        <div className="approach-list">
          {approachItems.map((item) => {
            const Icon = item.icon;
            return (
              <article className="approach-item" key={item.title}>
                <Icon />
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
              </article>
            );
          })}
          <ConversationBurst className="approach-list__burst" />
        </div>
      </section>

      <section className="teacher-band" aria-labelledby="teacher-title">
        <h2 id="teacher-title">Meet Inês</h2>
        <p>
          Native speaker from Porto <span aria-hidden="true">·</span> BA in Languages, Literatures &amp; Cultures{" "}
          <span aria-hidden="true">·</span> Portuguese and English
        </p>
      </section>

      <section className="editorial-callout">
        <p className="eyebrow">A lesson that meets you where you are</p>
        <h2>Useful from the first conversation.</h2>
        <p>
          Complete beginner or confident speaker, each lesson gives you language you can carry into real life.
        </p>
        <Link className="button button--coral" href="/book">Book a trial lesson</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
