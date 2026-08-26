import { AssetMark } from "@/components/BrandMarks";

/**
 * The banded heading the student-facing account pages share.
 *
 * Every other page opens on a colour immediately under the wordmark; these
 * three ran straight into cream, so they read as though they belonged to a
 * different site.
 */
export function AccountHero({ title, intro, mark }: { title: string; intro?: string; mark: string }) {
  return (
    <section className="account-hero" aria-labelledby="account-title">
      <div>
        <h1 id="account-title">{title}</h1>
        {intro ? <p>{intro}</p> : null}
      </div>
      <AssetMark asset={mark} className="account-hero__mark" priority />
    </section>
  );
}
