export const LESSON_PRICE_CENTS = Number(
  process.env.NEXT_PUBLIC_LESSON_PRICE_CENTS ?? process.env.LESSON_PRICE_CENTS ?? 2500
);
export const LESSON_CURRENCY = process.env.LESSON_CURRENCY ?? "eur";
export const LESSON_DURATION_MINUTES = Number(process.env.NEXT_PUBLIC_LESSON_DURATION_MINUTES ?? 60);
export const SAME_DAY_RESCHEDULE_FEE_CENTS = Number(
  process.env.NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS ?? 500
);
export const BOOKING_TIME_ZONE = "Europe/Lisbon";

export type BookingProvider = "square" | "acuity" | "calcom" | "none";
export type BookingMode = "auto" | "custom-square" | "square-hosted";
export type RescheduleFeeMode = "manual" | "policy-only" | "square-policy";

function normalizePublicHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";

    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizeBookingMode(value: string): BookingMode {
  if (value === "auto" || value === "custom-square") return value;
  return "square-hosted";
}

function normalizeRescheduleFeeMode(value: string): RescheduleFeeMode {
  if (value === "manual" || value === "square-policy") return value;
  return "policy-only";
}

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

function extractUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  return trimmed.match(/(?:src|href)=["']([^"']+)["']/i)?.[1] ?? trimmed;
}

function normalizeExternalBookingUrl(value: string, isAllowedHost: (hostname: string) => boolean) {
  const rawUrl = extractUrl(value);
  if (!rawUrl) return "";

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol) || !isAllowedHost(parsed.hostname)) {
      return "";
    }

    parsed.protocol = "https:";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function normalizeAcuitySchedulerUrl(value: string) {
  return normalizeExternalBookingUrl(value, isAcuityHost);
}

function isSquareHost(hostname: string) {
  return (
    hostname === "squareup.com" ||
    hostname.endsWith(".squareup.com") ||
    hostname === "square.site" ||
    hostname.endsWith(".square.site")
  );
}

export function normalizeSquareBookingUrl(value: string) {
  return normalizeExternalBookingUrl(value, isSquareHost);
}

export const ACUITY_SCHEDULER_URL = normalizeAcuitySchedulerUrl(
  process.env.NEXT_PUBLIC_ACUITY_SCHEDULER_URL ?? ""
);
export const SQUARE_BOOKING_URL = normalizeSquareBookingUrl(process.env.NEXT_PUBLIC_SQUARE_BOOKING_URL ?? "");
export const BOOKING_MODE = normalizeBookingMode(process.env.NEXT_PUBLIC_BOOKING_MODE ?? "");
export const RESCHEDULE_FEE_MODE = normalizeRescheduleFeeMode(
  process.env.NEXT_PUBLIC_RESCHEDULE_FEE_MODE ?? ""
);
export const BOOKING_API_BASE_URL = normalizePublicHttpUrl(process.env.NEXT_PUBLIC_BOOKING_API_BASE_URL ?? "");
export const USE_CUSTOM_SQUARE_BOOKING =
  BOOKING_MODE === "custom-square" || (BOOKING_MODE === "auto" && Boolean(BOOKING_API_BASE_URL));

export const BOOKING_PROVIDER: BookingProvider = USE_CUSTOM_SQUARE_BOOKING
  ? "square"
  : SQUARE_BOOKING_URL
  ? "square"
  : ACUITY_SCHEDULER_URL
    ? "acuity"
    : CALCOM_LINK
      ? "calcom"
      : "none";
export const BOOKING_PROVIDER_NAME =
  BOOKING_PROVIDER === "square"
    ? "Square"
    : BOOKING_PROVIDER === "acuity"
      ? "Acuity"
      : BOOKING_PROVIDER === "calcom"
        ? "Cal.com"
        : "the booking system";
export const BOOKING_DIRECT_URL =
  BOOKING_PROVIDER === "square"
    ? SQUARE_BOOKING_URL
    : BOOKING_PROVIDER === "acuity"
      ? ACUITY_SCHEDULER_URL
      : BOOKING_PROVIDER === "calcom"
        ? getCalComUrl()
        : "";
export const BOOKING_EMBED_URL =
  BOOKING_PROVIDER === "square" ? SQUARE_BOOKING_URL : BOOKING_PROVIDER === "acuity" ? ACUITY_SCHEDULER_URL : "";
export const CONTACT_WHATSAPP_NUMBER = "+351 963 161 134";
export const CONTACT_WHATSAPP_URL = "https://wa.me/351963161134";

export function formatMoney(cents = LESSON_PRICE_CENTS, currency = LESSON_CURRENCY) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function formatLessonDuration(minutes = LESSON_DURATION_MINUTES) {
  if (minutes < 60) return `${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;

  return remainingMinutes ? `${hourLabel} ${remainingMinutes} minutes` : hourLabel;
}
