export type LessonProduct = {
  id: "trial" | "single" | "long";
  title: string;
  price: string;
  duration: string;
  description: string;
  note?: string;
};

/**
 * Approved editorial product copy for the lessons page.
 *
 * One entry per bookable lesson, matching the booking Worker's `lesson_types`
 * table — ids included. Single lessons used to be one entry carrying two
 * prices, which made the two columns impossible to compare and did not line up
 * with what a student actually picks on /book. Keep the two in step: this copy
 * is what a visitor reads, that table is what they can book.
 */
export const lessonProducts: LessonProduct[] = [
  {
    id: "trial",
    title: "Trial lesson",
    price: "\u20ac20",
    duration: "60 minutes",
    description: "A full hour, not a sales call. We find out where your Portuguese is and what you want to do with it.",
    note: "Start here"
  },
  {
    id: "single",
    title: "Single lesson",
    price: "\u20ac25",
    duration: "60 minutes",
    description: "Book one at a time, or keep the same slot each week."
  },
  {
    id: "long",
    title: "Longer lesson",
    price: "\u20ac35",
    duration: "1 hour 30 minutes",
    description: "An hour and a half, if you want more time to talk."
  }
];

export const trialLesson = lessonProducts[0];
