export const LESSON_PRICE_CENTS = Number(process.env.LESSON_PRICE_CENTS ?? 1500);
export const LESSON_CURRENCY = process.env.LESSON_CURRENCY ?? "eur";

export type BookingProvider = "acuity" | "calcom" | "none";

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

function isAcuityHost(hostname: string) {
  return (
    hostname === "acuityscheduling.com" ||
    hostname.endsWith(".acuityscheduling.com") ||
    hostname === "squarespacescheduling.com" ||
    hostname.endsWith(".squarespacescheduling.com") ||
    hostname === "as.me" ||
    hostname.endsWith(".as.me")
  );
}

export function normalizeAcuitySchedulerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const iframeSrc = trimmed.match(/src=["']([^"']+)["']/i)?.[1];
  const rawUrl = iframeSrc ?? trimmed;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol) || !isAcuityHost(parsed.hostname)) {
      return "";
    }

    parsed.protocol = "https:";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export const ACUITY_SCHEDULER_URL = normalizeAcuitySchedulerUrl(
  process.env.NEXT_PUBLIC_ACUITY_SCHEDULER_URL ?? ""
);

export const BOOKING_PROVIDER: BookingProvider = ACUITY_SCHEDULER_URL ? "acuity" : CALCOM_LINK ? "calcom" : "none";
export const BOOKING_PROVIDER_NAME =
  BOOKING_PROVIDER === "acuity" ? "Acuity" : BOOKING_PROVIDER === "calcom" ? "Cal.com" : "the booking system";
export const BOOKING_DIRECT_URL =
  BOOKING_PROVIDER === "acuity" ? ACUITY_SCHEDULER_URL : BOOKING_PROVIDER === "calcom" ? getCalComUrl() : "";
export const BOOKING_EMBED_URL = BOOKING_PROVIDER === "acuity" ? ACUITY_SCHEDULER_URL : "";

export function formatMoney(cents = LESSON_PRICE_CENTS, currency = LESSON_CURRENCY) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format(cents / 100);
}
