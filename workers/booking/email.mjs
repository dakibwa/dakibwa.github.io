/**
 * Transactional email.
 *
 * Resend is the provider; DRY_RUN records the message in email_log without
 * sending, so the whole flow is testable before her domain is verified.
 *
 * Sending is deliberately never allowed to fail a booking. A student who has
 * just picked a time must get a confirmed booking even if the mail provider is
 * having a bad afternoon — the failure is recorded in email_log for the
 * reconciliation sweep instead of being thrown back at them.
 */

const BRAND = {
  blue: "#203e82",
  ink: "#1a3169",
  paper: "#f5ecd9",
  paperLight: "#fbf4e5",
  lavender: "#aaa4e6",
  coral: "#ef5d3c",
  coralAction: "#b43a26"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function layout({ heading, intro, rows, callout, action, footer }) {
  const rowsHtml = rows
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(139,130,211,.32);font:600 12px/1.4 Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#665fa6;width:38%;vertical-align:top">${escapeHtml(
            label
          )}</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(139,130,211,.32);font:400 16px/1.5 Arial,sans-serif;color:${
            BRAND.ink
          }">${value}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.paper}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.paper};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${
        BRAND.paperLight
      };border-radius:18px;overflow:hidden">
        <tr><td style="background:${BRAND.blue};padding:28px 32px">
          <p style="margin:0;font:600 12px/1.4 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${
            BRAND.lavender
          }">Português com a Inês</p>
          <h1 style="margin:8px 0 0;font:400 27px/1.25 Georgia,serif;color:${BRAND.paperLight}">${escapeHtml(
            heading
          )}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;font:400 16px/1.6 Arial,sans-serif;color:${BRAND.ink}">${intro}</p>
          ${
            callout
              ? `<p style="margin:0 0 20px;padding:14px 16px;border-left:4px solid ${BRAND.coral};background:rgba(239,93,60,.09);border-radius:0 10px 10px 0;font:400 15px/1.6 Arial,sans-serif;color:${BRAND.ink}">${callout}</p>`
              : ""
          }
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
          ${
            action
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="border-radius:999px;background:${BRAND.coralAction}"><a href="${escapeHtml(
                  action.url
                )}" style="display:inline-block;padding:13px 26px;font:600 15px/1 Arial,sans-serif;color:#fff;text-decoration:none;border-radius:999px">${escapeHtml(
                  action.label
                )}</a></td></tr></table>
                 <p style="margin:12px 0 0;font:400 13px/1.6 Arial,sans-serif;color:#665fa6;word-break:break-all">Or paste this into your browser:<br>${escapeHtml(
                   action.url
                 )}</p>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:0 32px 30px">
          <p style="margin:0;font:400 13px/1.6 Arial,sans-serif;color:#665fa6">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function plainText({ heading, intro, rows, callout, action, footer }) {
  const lines = [heading, "", stripTags(intro)];
  if (callout) lines.push("", stripTags(callout));
  lines.push("");
  for (const { label, value } of rows) lines.push(`${label}: ${stripTags(value)}`);
  if (action) lines.push("", `${action.label}: ${action.url}`);
  lines.push("", stripTags(footer));
  return lines.join("\n");
}

function stripTags(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export function renderEmail(content) {
  return { html: layout(content), text: plainText(content) };
}

/**
 * Sends, or records the attempt. Never throws: callers treat email as
 * best-effort and the log is the audit trail.
 */
export async function deliver(env, { to, subject, content, calendar, dedupeKey, bookingId, kind, replyTo }) {
  const { html, text } = renderEmail(content);
  const from = env.MAIL_FROM || "Português com a Inês <bookings@portuguesewithines.com>";
  const now = new Date().toISOString();

  // Idempotency before anything leaves: a retried request must not send twice.
  try {
    await env.DB.prepare(
      "INSERT INTO email_log (booking_id, kind, recipient, dedupe_key, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"
    )
      .bind(bookingId ?? null, kind, to, dedupeKey, now)
      .run();
  } catch {
    return { ok: true, skipped: "already-sent" };
  }

  const attachments = calendar
    ? [
        {
          filename: "lesson.ics",
          content: base64(calendar.body),
          content_type: `text/calendar; charset=utf-8; method=${calendar.method}`
        }
      ]
    : undefined;

  if (!env.RESEND_API_KEY || env.EMAIL_DRY_RUN === "1") {
    await env.DB.prepare("UPDATE email_log SET status = 'dry-run' WHERE dedupe_key = ?").bind(dedupeKey).run();
    console.log(JSON.stringify({ dryRun: true, to, subject, kind, calendar: calendar?.method ?? null }));
    return { ok: true, dryRun: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(attachments ? { attachments } : {})
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      await env.DB.prepare("UPDATE email_log SET status = 'failed', error = ? WHERE dedupe_key = ?")
        .bind(String(payload.message ?? response.status).slice(0, 400), dedupeKey)
        .run();
      return { ok: false, error: payload.message ?? `HTTP ${response.status}` };
    }

    await env.DB.prepare("UPDATE email_log SET status = 'sent', provider_id = ? WHERE dedupe_key = ?")
      .bind(payload.id ?? null, dedupeKey)
      .run();
    return { ok: true, id: payload.id };
  } catch (error) {
    await env.DB.prepare("UPDATE email_log SET status = 'failed', error = ? WHERE dedupe_key = ?")
      .bind(String(error?.message ?? error).slice(0, 400), dedupeKey)
      .run();
    return { ok: false, error: String(error?.message ?? error) };
  }
}
