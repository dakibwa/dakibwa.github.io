import type { CSSProperties } from "react";
import { publicAssetUrl } from "@/lib/paths";

type MarkProps = {
  className?: string;
};

type QuestionEchoStyle = CSSProperties & {
  "--question-echo-image": string;
};

type BookingTimeWindowStyle = CSSProperties & {
  "--booking-time-window-image": string;
};

type ApproachPathwayStyle = CSSProperties & {
  "--approach-pathway-image": string;
};

type LessonsRhythmStyle = CSSProperties & {
  "--lessons-rhythm-image": string;
};

type FAQAnswerIndexStyle = CSSProperties & {
  "--faq-answer-index-image": string;
};

function markClass(name: string, className?: string) {
  return className ? `${name} ${className}` : name;
}

export function PlantMark({ className }: MarkProps) {
  return (
    <span className={markClass("plant-mark", className)} aria-hidden="true">
      <svg viewBox="0 0 120 150" role="presentation">
        <path className="mark-stroke" d="M60 111V33" />
        <path className="mark-fill" d="M57 56C30 56 15 40 12 16c27 1 43 15 45 40Z" />
        <path className="mark-fill" d="M63 56c27 0 42-16 45-40-27 1-43 15-45 40Z" />
        <path className="mark-fill" d="M57 89C32 89 18 75 16 54c25 1 39 14 41 35Z" />
        <path className="mark-fill" d="M63 89c25 0 39-14 41-35-25 1-39 14-41 35Z" />
        <circle className="mark-accent" cx="60" cy="124" r="20" />
      </svg>
    </span>
  );
}

export function WaveMark({ className }: MarkProps) {
  return (
    <span className={markClass("wave-mark", className)} aria-hidden="true">
      <svg viewBox="0 0 150 110" role="presentation">
        <path className="mark-stroke" d="M10 24c23-20 42 20 65 0s42 20 65 0" />
        <path className="mark-stroke mark-accent-stroke" d="M10 55c23-20 42 20 65 0s42 20 65 0" />
        <path className="mark-stroke" d="M10 86c23-20 42 20 65 0s42 20 65 0" />
      </svg>
    </span>
  );
}

export function SunMark({ className }: MarkProps) {
  return (
    <span className={markClass("sun-mark", className)} aria-hidden="true">
      <svg viewBox="0 0 140 140" role="presentation">
        <g className="mark-stroke sun-rays">
          <path d="M70 8v22M70 110v22M8 70h22M110 70h22" />
          <path d="m26 26 16 16M98 98l16 16M114 26 98 42M42 98l-16 16" />
          <path d="m46 13 8 20M86 107l8 20M13 46l20 8M107 86l20 8" />
          <path d="m94 13-8 20M54 107l-8 20M127 46l-20 8M33 86l-20 8" />
        </g>
        <circle className="mark-accent" cx="70" cy="70" r="22" />
      </svg>
    </span>
  );
}

export function ConversationBurst({ className }: MarkProps) {
  return <span className={markClass("conversation-burst", className)} aria-hidden="true" />;
}

export function QuestionEchoMark({ className }: MarkProps) {
  return (
    <span
      className={markClass("question-echo-mark", className)}
      aria-hidden="true"
      style={
        {
          "--question-echo-image": publicAssetUrl("/visuals/faq-question-echo.svg")
        } as QuestionEchoStyle
      }
    />
  );
}

export function ApproachPathwayMark({ className }: MarkProps) {
  return (
    <span
      className={markClass("approach-pathway-mark", className)}
      aria-hidden="true"
      style={
        {
          "--approach-pathway-image": publicAssetUrl("/visuals/approach-pathway.svg")
        } as ApproachPathwayStyle
      }
    />
  );
}

export function LessonsRhythmMark({ className }: MarkProps) {
  return (
    <span
      className={markClass("lessons-rhythm-mark", className)}
      aria-hidden="true"
      style={
        {
          "--lessons-rhythm-image": publicAssetUrl("/visuals/lessons-rhythm.svg")
        } as LessonsRhythmStyle
      }
    />
  );
}

export function FAQAnswerIndexMark({ className }: MarkProps) {
  return (
    <span
      className={markClass("faq-answer-index-mark", className)}
      aria-hidden="true"
      style={
        {
          "--faq-answer-index-image": publicAssetUrl("/visuals/faq-answer-index.svg")
        } as FAQAnswerIndexStyle
      }
    />
  );
}

export function BookingTimeWindowMark({ className }: MarkProps) {
  return (
    <span
      className={markClass("booking-time-window-mark", className)}
      aria-hidden="true"
      style={
        {
          "--booking-time-window-image": publicAssetUrl("/visuals/booking-time-window.svg")
        } as BookingTimeWindowStyle
      }
    />
  );
}
