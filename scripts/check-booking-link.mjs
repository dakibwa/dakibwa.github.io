import { existsSync, readFileSync } from "node:fs";

loadDotEnv(".env.local");
loadDotEnv(".env");

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
