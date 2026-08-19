import { publicAssetPath } from "@/lib/paths";

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
  tone?: "green" | "cream";
};

/**
 * The brand wordmark rendered as an actual <img> element for LCP eligibility.
 * CSS filters recolour the cream-on-transparent original to match the tone.
 * Using a real image instead of a CSS mask enables the browser to recognise
 * this as the Largest Contentful Paint candidate.
 */
export function BrandWordmark({
  className,
  priority = false,
  tone = "green"
}: BrandWordmarkProps) {
  const classes = [
    "brand-wordmark",
    `brand-wordmark--${tone}`,
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Using <img> intentionally for LCP eligibility; CSS filters recolour the image which doesn't work with next/image optimization.
    <img
      alt="Português com a Inês"
      className={classes}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      height={236}
      loading={priority ? "eager" : "lazy"}
      src={publicAssetPath("/visuals/wordmark-cream.webp")}
      width={760}
    />
  );
}
