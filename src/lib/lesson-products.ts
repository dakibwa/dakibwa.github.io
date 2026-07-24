export type LessonProduct = {
  id: "trial" | "single";
  title: string;
  price?: string;
  duration?: string;
  options?: {
    price: string;
    duration: string;
  }[];
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
    price: "€20",
    duration: "60 minutes",
    description: "A relaxed full first lesson to experience the teaching style and understand your level, goals, and how you learn best.",
    note: "Start here"
  },
  {
    id: "single",
    title: "Single lessons",
    options: [
      {
        price: "€25",
        duration: "60 minutes"
      },
      {
        price: "€35",
        duration: "1 hour 30 minutes"
      }
    ],
    description: "A focused one-to-one lesson shaped around the Portuguese you want to use in real life."
  }
];

export const trialLesson = lessonProducts[0];
