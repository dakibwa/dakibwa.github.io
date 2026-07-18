/**
 * Hand-cut brand marks, rebuilt as code-native SVG from the business-card and
 * sticker language on design/primary-brand-direction.png:
 *  - PortoStamp: the round rubber-stamp badge ("PORTO · PESSOAL · PRÁTICO").
 *  - VamosSticker: the die-cut spiky starburst sticker ("Vamos lá!").
 *  - Splat: the organic paint-burst, painted via the extracted mask so it can
 *    be recoloured per surface.
 */

type MarkProps = {
  className?: string;
};

const STAMP_ARC_RADIUS = 74;
const STAMP_ARC_D = `M100,100 m-${STAMP_ARC_RADIUS},0 a${STAMP_ARC_RADIUS},${STAMP_ARC_RADIUS} 0 1,1 ${STAMP_ARC_RADIUS * 2},0 a${STAMP_ARC_RADIUS},${STAMP_ARC_RADIUS} 0 1,1 -${STAMP_ARC_RADIUS * 2},0`;

/** Rendered once (in the layout) so every stamp shares one arc path. */
export function BrandMarkSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <path id="porto-stamp-arc" d={STAMP_ARC_D} />
      </defs>
    </svg>
  );
}

export function PortoStamp({ className }: MarkProps) {
  const ring = "PORTO · PESSOAL · PRÁTICO · PORTO · PESSOAL · PRÁTICO · ";
  const circumference = 2 * Math.PI * STAMP_ARC_RADIUS; // fit one full pass, no seam overlap
  return (
    <span className={className ? `porto-stamp ${className}` : "porto-stamp"} aria-hidden="true">
      <svg viewBox="0 0 200 200" role="presentation">
        <circle className="porto-stamp-ring" cx="100" cy="100" r="92" />
        <circle className="porto-stamp-ring is-inner" cx="100" cy="100" r="54" />
        <text className="porto-stamp-text">
          <textPath href="#porto-stamp-arc" startOffset="0" textLength={circumference} lengthAdjust="spacingAndGlyphs">
            {ring}
          </textPath>
        </text>
        <g className="porto-stamp-core">
          <text x="100" y="94" textAnchor="middle" className="porto-stamp-word">
            PORTO
          </text>
          <text x="100" y="118" textAnchor="middle" className="porto-stamp-sub">
            PESSOAL
          </text>
        </g>
      </svg>
    </span>
  );
}

export function VamosSticker({ className }: MarkProps) {
  // 24-point hand-cut starburst outline.
  const points = 24;
  const cx = 100;
  const cy = 100;
  const outer = 96;
  const inner = 80;
  const path = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const wobble = i % 3 === 0 ? 3 : 0;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * (r - wobble);
    const y = cy + Math.sin(angle) * (r - wobble);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <span className={className ? `vamos-sticker ${className}` : "vamos-sticker"} aria-hidden="true">
      <svg viewBox="0 0 200 200" role="presentation">
        <polygon className="vamos-sticker-burst" points={path} />
        <text x="100" y="90" textAnchor="middle" className="vamos-sticker-top">
          Pronto para
        </text>
        <text x="100" y="112" textAnchor="middle" className="vamos-sticker-script">
          Vamos lá!
        </text>
      </svg>
    </span>
  );
}

export function Splat({ className }: MarkProps) {
  return <span className={className ? `splat ${className}` : "splat"} aria-hidden="true" />;
}
