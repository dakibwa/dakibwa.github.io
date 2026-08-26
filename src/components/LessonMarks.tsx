import { AssetMark } from "@/components/BrandMarks";

/**
 * Marks used by the booking flow.
 *
 * The lesson emblems are the production splat SVGs already shipping in
 * `public/visuals/v2-splats/` — the brand's own square marks — rather than
 * anything drawn here. The three chosen deliberately avoid repeating the three
 * used in the booking side panel.
 */
const lessonSplats: Record<string, string> = {
  trial: "/visuals/v2-splats/built-around-you-splat-v2.svg",
  single: "/visuals/v2-splats/at-your-pace-splat-v2.svg",
  long: "/visuals/v2-splats/real-life-splat-v2.svg"
};

export function lessonSplat(lessonTypeId: string) {
  return lessonSplats[lessonTypeId] ?? lessonSplats.single;
}

/** Falls back to the standard-hour emblem for any lesson type added later. */
export function LessonMark({ lessonTypeId, className }: { lessonTypeId: string; className?: string }) {
  return <AssetMark asset={lessonSplat(lessonTypeId)} className={className} />;
}

/**
 * A hand-drawn rule between the step trail and the step itself, so the seam
 * carries the same drawn quality as the display type rather than a hairline.
 */
export function SquiggleRule({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
      <path
        d="M2 7c14-6 28 4 42-1s28 5 42 0 28 4 42-1 28 5 42 0 28 4 42-1 28 5 42 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}
