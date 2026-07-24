import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const principles = [
  {
    title: "One to one",
    body: "Personal attention to match your goals, level and interests.",
    asset: "/visuals/v2-splats/one-to-one-splat-v2.svg"
  },
  {
    title: "At your pace",
    body: "A calm, focused space to build confidence and communicate naturally.",
    asset: "/visuals/v2-splats/at-your-pace-splat-v2.svg"
  },
  {
    title: "For real life",
    body: "Practical Portuguese for everyday situations, travel or work.",
    asset: "/visuals/v2-splats/real-life-splat-v2.svg"
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
          <AssetMark
            asset="/visuals/generated-splats/business-card-splat-generated-v2.png"
            className="home-hero__burst"
          />
        </div>
      </section>

      <section className="principles-strip" aria-label="How lessons work">
        {principles.map((principle) => {
          return (
            <article className="principle" key={principle.title}>
              <AssetMark asset={principle.asset} />
              <div>
                <h2>{principle.title}</h2>
                <span className="short-rule" aria-hidden="true" />
                <p>{principle.body}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="home-closing" aria-label="Explore the approach and lessons">
        <div>
          <Link className="text-action" href="/approach">See the approach</Link>
          <Link className="text-action" href="/lessons">View lessons</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
