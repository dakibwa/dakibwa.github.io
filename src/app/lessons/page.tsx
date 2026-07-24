import type { Metadata } from "next";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { lessonProducts } from "@/lib/lesson-products";

export const metadata: Metadata = {
  title: "Lessons | Português com a Inês",
  description: "One-to-one European Portuguese lessons online or in Porto."
};

export default function LessonsPage() {
  return (
    <main className="lessons-page">
      <SiteHeader currentPage="lessons" />

      <section className="lessons-hero" aria-labelledby="lessons-title">
        <div className="lessons-hero__title">
          <h1 id="lessons-title">
            Private lessons,<br />
            built around <em>you.</em>
          </h1>
        </div>
        <div className="lessons-hero__art">
          <AssetMark asset="/visuals/generated-splats/open-centre-lavender-splat.png" className="lessons-hero__field" />
        </div>
      </section>

      <section className="lesson-programme" aria-labelledby="programme-title">
        <p className="lesson-programme__intro" id="programme-title">
          One-to-one European Portuguese, tailored to your goals and pace.
        </p>
        <div className="lesson-programme__grid">
          {lessonProducts.map((product) => (
            <article className="lesson-product" key={product.id}>
              <p className="eyebrow">{product.title}</p>
              {product.options ? (
                <div className="lesson-product__options">
                  {product.options.map((option) => (
                    <div className="lesson-product__option" key={option.duration}>
                      <p className="lesson-product__price">{option.price}</p>
                      <p className="lesson-product__duration">{option.duration}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="lesson-product__price">{product.price}</p>
                  <p className="lesson-product__duration">{product.duration}</p>
                </>
              )}
              <span className="lesson-product__rule" aria-hidden="true" />
              <p className="lesson-product__description">{product.description}</p>
              {product.note ? (
                <div className="lesson-product__note">
                  <span>{product.note}</span>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="lesson-location-band">
        <div>
          <AssetMark asset="/visuals/v2-splats/in-porto-or-online-splat-v2.svg" className="lesson-location-band__mark" />
          <p>In Porto or online</p>
        </div>
        <Link className="button button--coral" href="/book">Book a lesson</Link>
      </section>

      <section className="lessons-note">
        <p>
          Square shows the current appointment details and final total before you confirm.
        </p>
        <Link className="text-action" href="/faq#faq-payment">Read payment answers</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
