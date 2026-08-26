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
 * Approved editorial product copy for the lessons page.
 *
 * The booking Worker's `lesson_types` table is the source of truth for what is
 * actually bookable, its duration and its price. Keep the two in step: this
 * copy is what a visitor reads, that table is what they can book.
 */
export const lessonProducts: LessonProduct[] = [
  {
    id: "trial",
    title: "Trial lesson",
    price: "€20",
    duration: "60 minutes",
    description: "A full hour, not a sales call. We find out where your Portuguese is and what you want to do with it.",
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
    description: "Book one at a time, or keep the same slot each week. Take the longer one if you want more time to talk."
  }
];

export const trialLesson = lessonProducts[0];
