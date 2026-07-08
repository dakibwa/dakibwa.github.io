import Image from "next/image";
import { publicAssetPath } from "@/lib/paths";

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
};

/**
 * The real hand-lettered wordmark, extracted from the green business card
 * (design/business-cards/green-card-front.png) and recoloured to lavender-light
 * for the deep-green surfaces it sits on. Uses publicAssetPath so the site base
 * path (e.g. /portugal on akibwa.com) is applied — next/image with `unoptimized`
 * does not add it automatically.
 */
export function BrandWordmark({ className, priority = false }: BrandWordmarkProps) {
  return (
    <Image
      alt="Português com a Inês"
      className={className ? `brand-wordmark ${className}` : "brand-wordmark"}
      src={publicAssetPath("/visuals/wordmark-cream.png")}
      width={900}
      height={280}
      priority={priority}
      sizes="(max-width: 640px) 200px, 260px"
    />
  );
}
