import { existsSync, readFileSync } from "node:fs";

loadDotEnv(".env.local");
loadDotEnv(".env");

const rawBookingMode = process.env.NEXT_PUBLIC_BOOKING_MODE ?? "";
const bookingMode = normalizeBookingMode(rawBookingMode);
const rawBookingApiBaseUrl = process.env.NEXT_PUBLIC_BOOKING_API_BASE_URL ?? "";
const bookingApiBaseUrl = normalizePublicHttpUrl(rawBookingApiBaseUrl);
const allowPreviewBooking = process.env.ALLOW_BOOKING_PREVIEW === "1";
const rawRescheduleFeeMode = process.env.NEXT_PUBLIC_RESCHEDULE_FEE_MODE ?? "";
const rescheduleFeeMode = normalizeRescheduleFeeMode(rawRescheduleFeeMode);

if (rawRescheduleFeeMode.trim() && !rescheduleFeeMode) {
  console.error("NEXT_PUBLIC_RESCHEDULE_FEE_MODE must be manual, square-policy, or policy-only.");
  process.exit(1);
}

if (!allowPreviewBooking && (!rescheduleFeeMode || rescheduleFeeMode === "policy-only")) {
  console.error(
    "Choose NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual or square-policy before production. policy-only is for local design preview and does not enforce the €5 same-day rule."
  );
  process.exit(1);
}

if (rawBookingApiBaseUrl.trim() && !bookingApiBaseUrl) {
  console.error("NEXT_PUBLIC_BOOKING_API_BASE_URL must be an http(s) URL for the Square booking adapter.");
  process.exit(1);
}

const rawSquareUrl = process.env.NEXT_PUBLIC_SQUARE_BOOKING_URL ?? "";
const squareUrl = normalizeSquareBookingUrl(rawSquareUrl);

if (rawSquareUrl.trim() && !squareUrl) {
  console.error(
    "NEXT_PUBLIC_SQUARE_BOOKING_URL is set, but it is not a valid Square booking URL. Use a squareup.com or square.site booking link, or paste Square's one-line iframe/button code."
  );
  process.exit(1);
}

if (bookingMode === "custom-square") {
  if (!bookingApiBaseUrl && !allowPreviewBooking) {
    console.error(
      "NEXT_PUBLIC_BOOKING_MODE=custom-square requires NEXT_PUBLIC_BOOKING_API_BASE_URL. Set ALLOW_BOOKING_PREVIEW=1 only for local/demo preview builds."
    );
    process.exit(1);
  }

  if (bookingApiBaseUrl) {
    await checkBookingApiHealth(bookingApiBaseUrl);
  } else {
    console.log("Custom Square booking preview allowed; API health check skipped.");
  }

  if (!squareUrl && !allowPreviewBooking) {
    console.error("NEXT_PUBLIC_SQUARE_BOOKING_URL is required as the hosted Square fallback/manage link.");
    process.exit(1);
  }

  if (squareUrl) {
    await checkUrl({
      provider: "square",
      url: squareUrl,
      failureMessage:
        "Square booking link is not live yet. In Square, go to Appointments > Online booking > Channels > Add your booking flow to an existing site."
    });
  }

  process.exit(0);
}

if (bookingApiBaseUrl) {
  await checkBookingApiHealth(bookingApiBaseUrl);
  process.exit(0);
}

if (squareUrl) {
  await checkUrl({
    provider: "square",
    url: squareUrl,
    failureMessage:
      "Square booking link is not live yet. In Square, go to Appointments > Online booking > Channels > Add your booking flow to an existing site."
  });
  process.exit(0);
}

const rawAcuityUrl = process.env.NEXT_PUBLIC_ACUITY_SCHEDULER_URL ?? "";
const acuityUrl = normalizeAcuitySchedulerUrl(rawAcuityUrl);

if (rawAcuityUrl.trim() && !acuityUrl) {
  console.error(
    "NEXT_PUBLIC_ACUITY_SCHEDULER_URL is set, but it is not a valid Acuity scheduler URL. Use an acuityscheduling.com, squarespacescheduling.com, or as.me scheduler link."
  );
  process.exit(1);
}

if (acuityUrl) {
  await checkUrl({
    provider: "acuity",
    url: acuityUrl,
    failureMessage:
      "Acuity booking link is not live yet. Copy the scheduler link from Acuity Scheduling Page > Link after the appointment type is ready."
  });
  process.exit(0);
}

const calLink = normalizeCalComLink(process.env.NEXT_PUBLIC_CALCOM_LINK ?? "");

if (!calLink) {
  console.log("No booking provider configured; booking embed will show the setup placeholder.");
  process.exit(0);
}

await checkUrl({
  provider: "calcom",
  url: `https://cal.com/${calLink}`,
  failureMessage:
    "Cal.com booking link is not live yet. Create the event and connect payment before publishing this as the active booking link."
});

async function checkUrl({ provider, url, failureMessage }) {
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();
  const title = body.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ?? "";
  const notFound = response.status === 404 || /^404:/i.test(title);

  console.log(
    JSON.stringify(
      {
        provider,
        url,
        status: response.status,
        ok: response.ok && !notFound,
        title
      },
      null,
      2
    )
  );

  if (!response.ok || notFound) {
    console.error(`${failureMessage} Checked URL: ${url}`);
    process.exit(1);
  }
}

function normalizeCalComLink(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "cal.com" || parsed.hostname === "app.cal.com") {
      return parsed.pathname.replace(/^\/+/, "");
    }
  } catch {
    // Plain Cal.com slugs land here.
  }

  return trimmed
    .replace(/^https?:\/\/(?:app\.)?cal\.com\//, "")
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "");
}

function normalizeAcuitySchedulerUrl(value) {
  return normalizeExternalBookingUrl(value, isAcuityHost);
}

function normalizeSquareBookingUrl(value) {
  return normalizeExternalBookingUrl(value, isSquareHost);
}

function normalizeBookingMode(value) {
  if (value === "auto" || value === "custom-square") return value;
  return "square-hosted";
}

function normalizeRescheduleFeeMode(value) {
  if (value === "manual" || value === "square-policy" || value === "policy-only") return value;
  return "";
}

function normalizePublicHttpUrl(value) {
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

async function checkBookingApiHealth(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/health`, { redirect: "follow" });
  const body = await response.json().catch(() => ({}));
  const ok = response.ok && body.ok === true;

  console.log(
    JSON.stringify(
      {
        provider: "square-api",
        url: `${apiBaseUrl}/health`,
        status: response.status,
        ok,
        missing: body.missing ?? []
      },
      null,
      2
    )
  );

  if (!ok) {
    console.error("Square booking API health check failed. Check the Worker deployment and private Square env/secrets.");
    process.exit(1);
  }
}

function normalizeExternalBookingUrl(value, isAllowedHost) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const rawUrl = trimmed.match(/(?:src|href)=["']([^"']+)["']/i)?.[1] ?? trimmed;
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

function isAcuityHost(hostname) {
  return (
    hostname === "acuityscheduling.com" ||
    hostname.endsWith(".acuityscheduling.com") ||
    hostname === "squarespacescheduling.com" ||
    hostname.endsWith(".squarespacescheduling.com") ||
    hostname === "as.me" ||
    hostname.endsWith(".as.me")
  );
}

function isSquareHost(hostname) {
  return (
    hostname === "squareup.com" ||
    hostname.endsWith(".squareup.com") ||
    hostname === "square.site" ||
    hostname.endsWith(".square.site")
  );
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    process.env[key] ??= value;
  }
}
