export const LESSON_PRICE_CENTS = Number(process.env.LESSON_PRICE_CENTS ?? 4500);
export const LESSON_CURRENCY = process.env.LESSON_CURRENCY ?? "eur";

export function formatMoney(cents = LESSON_PRICE_CENTS, currency = LESSON_CURRENCY) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format(cents / 100);
}
