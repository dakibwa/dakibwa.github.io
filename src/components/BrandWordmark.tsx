import Image from "next/image";

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
};

/**
 * The real hand-lettered wordmark, extracted from the green business card
 * (design/business-cards/green-card-front.png) and recoloured to lavender-light
 * for the deep-green surfaces it sits on. next/image prepends basePath itself,
 * so the src stays a plain root-relative path.
 */
export function BrandWordmark({ className, priority = false }: BrandWordmarkProps) {
  return (
    <Image
      alt="Português com a Inês"
      className={className ? `brand-wordmark ${className}` : "brand-wordmark"}
      src="/visuals/wordmark-cream.png"
      width={900}
      height={280}
      priority={priority}
      sizes="(max-width: 640px) 200px, 260px"
    />
  );
}
