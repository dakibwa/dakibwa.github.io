import type { Metadata } from "next";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { lessonProducts } from "@/lib/lesson-products";

export const metadata: Metadata = {
  title: "Lessons | Português com a Inês",
  description: "Prices for one-to-one European Portuguese lessons, online or in Porto."
};

export default function LessonsPage() {
  return (
    <>
      <SiteHeader currentPage="lessons" />

      <main className="lessons-page" id="main-content">
        <section className="lessons-hero" aria-labelledby="lessons-title">
          <div className="lessons-hero__title">
            <h1 id="lessons-title">
              Lessons, and<br />
              what they <em>cost.</em>
            </h1>
          </div>
          <div className="lessons-hero__art">
            <AssetMark
              asset="/visuals/generated-splats/open-centre-lavender-splat.webp"
              avifAsset="/visuals/generated-splats/open-centre-lavender-splat.avif"
              className="lessons-hero__field"
              height={1254}
              mobileAsset="/visuals/generated-splats/open-centre-lavender-splat-mobile.webp"
              mobileAvifAsset="/visuals/generated-splats/open-centre-lavender-splat-mobile.avif"
              priority
              width={1254}
            />
          </div>
        </section>

        <section className="lesson-programme" aria-labelledby="programme-title">
          <p className="lesson-programme__intro" id="programme-title">
            One to one, in Porto or online. An hour, or an hour and a half if you want longer.
          </p>
          <div className="lesson-programme__grid">
            {lessonProducts.map((product) => (
              <article className="lesson-product" key={product.id}>
                <p className="eyebrow">{product.title}</p>
                <p className="lesson-product__price">{product.price}</p>
                <p className="lesson-product__duration">{product.duration}</p>
                <span className="lesson-product__rule" aria-hidden="true" />
                <p className="lesson-product__description">{product.description}</p>
                <div className="lesson-product__note">
                  <span>{product.note ?? ""}</span>
                </div>
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
          <p>Pick a time on the booking page. You pay on the day, in person with Inês.</p>
          <Link className="text-action" href="/faq#faq-payment">Payment questions</Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
