const calLink = normalizeCalComLink(process.env.NEXT_PUBLIC_CALCOM_LINK ?? "");

if (!calLink) {
  console.log("No NEXT_PUBLIC_CALCOM_LINK configured; booking embed will show the setup placeholder.");
  process.exit(0);
}

const url = `https://cal.com/${calLink}`;
const response = await fetch(url, { redirect: "follow" });
const body = await response.text();
const title = body.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ?? "";
const notFound = response.status === 404 || /^404:/i.test(title);

console.log(
  JSON.stringify(
    {
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
  console.error(
    `Cal.com booking link is not live yet: ${url}. Create the event and connect Stripe in Cal.com before publishing this as the active booking link.`
  );
  process.exit(1);
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
