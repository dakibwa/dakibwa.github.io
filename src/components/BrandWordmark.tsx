import type { CSSProperties } from "react";
import { publicAssetUrl } from "@/lib/paths";

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
  tone?: "green" | "cream";
};

type WordmarkStyle = CSSProperties & {
  "--wordmark-image": string;
};

/**
 * The hand-lettered business-card wordmark is used as an alpha mask so the
 * original lettering stays crisp while it can switch between green and cream.
 * The priority prop is retained for call-site compatibility; a CSS mask does
 * not participate in image loading priority.
 */
export function BrandWordmark({
  className,
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
    <span
      aria-label="Português com a Inês"
      className={classes}
      role="img"
      style={{ "--wordmark-image": publicAssetUrl("/visuals/wordmark-cream.png") } as WordmarkStyle}
    />
  );
}
