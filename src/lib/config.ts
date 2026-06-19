export const LESSON_PRICE_CENTS = Number(process.env.LESSON_PRICE_CENTS ?? 1500);
export const LESSON_CURRENCY = process.env.LESSON_CURRENCY ?? "eur";

export function normalizeCalComLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "cal.com" || parsed.hostname === "app.cal.com") {
      return parsed.pathname.replace(/^\/+/, "");
    }
  } catch {
    // Plain Cal.com slugs such as "daniel-atkinson-7bslrj/first-portuguese-lesson" land here.
  }

  return trimmed
    .replace(/^https?:\/\/(?:app\.)?cal\.com\//, "")
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "");
}

export const CALCOM_LINK = normalizeCalComLink(process.env.NEXT_PUBLIC_CALCOM_LINK ?? "");

export function getCalComUrl(calLink = CALCOM_LINK) {
  return calLink ? `https://cal.com/${calLink}` : "";
}

export function formatMoney(cents = LESSON_PRICE_CENTS, currency = LESSON_CURRENCY) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format(cents / 100);
}
