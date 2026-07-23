export type LessonProduct = {
  id: "trial" | "single" | "five";
  title: string;
  price: string;
  duration: string;
  description: string;
  note?: string;
};

/**
 * Approved editorial product copy. Square remains the source of truth for
 * appointment availability, checkout, and the final confirmation screen.
 */
export const lessonProducts: LessonProduct[] = [
  {
    id: "trial",
    title: "Trial lesson",
    price: "€25",
    duration: "45 minutes",
    description: "A relaxed first conversation to understand your level, goals, and the way you learn best.",
    note: "Start here"
  },
  {
    id: "single",
    title: "Single lesson",
    price: "€45",
    duration: "60 minutes",
    description: "A focused one-to-one lesson shaped around the Portuguese you want to use in real life."
  },
  {
    id: "five",
    title: "5 lessons",
    price: "€210",
    duration: "60 minutes each",
    description: "A steady rhythm for building confidence, with each lesson continuing naturally from the last.",
    note: "Save €15"
  }
];

export const trialLesson = lessonProducts[0];
