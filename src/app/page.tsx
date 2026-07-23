import Link from "next/link";
import { ConversationBurst, PlantMark, SunMark, WaveMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const principles = [
  {
    title: "One to one",
    body: "Personal attention to match your goals, level and interests.",
    icon: PlantMark
  },
  {
    title: "At your pace",
    body: "A calm, focused space to build confidence and communicate naturally.",
    icon: WaveMark
  },
  {
    title: "For real life",
    body: "Practical Portuguese for everyday situations, travel or work.",
    icon: SunMark
  }
];

export default function Home() {
  return (
    <main className="home-page">
      <SiteHeader currentPage="home" />

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <h1 id="home-title">
            <span>Português</span>
            <span className="home-title__script">com a</span>
            <span>Inês</span>
          </h1>
          <div className="editorial-rule" aria-hidden="true" />
          <p>European Portuguese in Porto —<br />or wherever you are.</p>
          <Link className="button button--coral" href="/book">
            Book a lesson
          </Link>
        </div>
        <div className="home-hero__art">
          <ConversationBurst />
        </div>
      </section>

      <section className="principles-strip" aria-labelledby="principles-title">
        <div className="principles-strip__label">
          <p className="eyebrow" id="principles-title">Approach</p>
        </div>
        {principles.map((principle) => {
          const Icon = principle.icon;
          return (
            <article className="principle" key={principle.title}>
              <Icon />
              <div>
                <h2>{principle.title}</h2>
                <span className="short-rule" aria-hidden="true" />
                <p>{principle.body}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="home-closing" aria-label="Explore lessons">
        <p>Private European Portuguese, shaped around you.</p>
        <div>
          <Link className="text-action" href="/approach">See the approach</Link>
          <Link className="text-action" href="/lessons">View lessons</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
