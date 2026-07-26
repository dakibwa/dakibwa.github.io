import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const principles = [
  {
    title: "Just you",
    body: "No class to keep up with. We spend the hour on whatever you need most.",
    asset: "/visuals/v2-splats/one-to-one-splat-v2.svg"
  },
  {
    title: "Slow is fine",
    body: "Repeat things. Ask the obvious question. Nobody is waiting.",
    asset: "/visuals/v2-splats/at-your-pace-splat-v2.svg"
  },
  {
    title: "Portuguese you’ll use",
    body: "Ordering coffee, phone calls, small talk with the neighbours. Not textbook dialogues.",
    asset: "/visuals/v2-splats/real-life-splat-v2.svg"
  }
];

export default function Home() {
  return (
    <>
      <SiteHeader currentPage="home" />

      <main className="home-page" id="main-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__copy">
            <h1 id="home-title">
              <span>Português</span>
              <span className="home-title__script">com a</span>
              <span>Inês</span>
            </h1>
            <div className="editorial-rule" aria-hidden="true" />
            <p>European Portuguese lessons in Porto.<br />Or online, wherever you are.</p>
            <Link className="button button--coral" href="/book">
              Book a lesson
            </Link>
          </div>
          <div className="home-hero__art">
            <AssetMark
              asset="/visuals/generated-splats/business-card-splat-generated-v2.webp"
              className="home-hero__burst"
              mobileAsset="/visuals/generated-splats/business-card-splat-generated-v2-mobile.webp"
              priority
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

        <section className="home-closing" aria-label="Read more or book a lesson">
          <div className="home-closing__links">
            <Link className="text-action" href="/approach">How I teach</Link>
            <Link className="text-action" href="/lessons">Lessons and prices</Link>
          </div>
          <Link className="button button--coral" href="/book">
            Book a lesson
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
