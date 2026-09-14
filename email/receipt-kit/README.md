# Receipt emails for Inês

This kit gives the existing Gmail-through-Codex automation the same design as
the booking emails. The email accompanies the original PDF downloaded from
Faturas e Recibos. It does not create or replace that document.

## Start here

Save this folder on Inês's computer. Open `example.html` to see the design, or
`example-mobile.png` for the phone preview. The example uses fictional details
and is not a receipt. No customer PDF is included in this kit.

Give Codex this request alongside the existing receipt automation:

> Use receipt-template.html and receipt-template.txt from this folder when
> emailing customers their issued Faturas e Recibos PDFs through my Gmail.
> Keep the existing customer matching, issue/send approval rules and duplicate
> prevention. Fill the fields from the customer record and the issued PDF,
> escape values for HTML, and attach the matching original PDF unchanged.
> Send a multipart email with plain-text and HTML versions; do not paste HTML
> source into Gmail's normal compose box. Show me one completed draft with its
> recipient, subject and PDF attachment before enabling the new template in
> the existing automation. Use my aprenderportugues.ines@gmail.com account.

## Template fields

Replace every `{{field}}` in both templates. `fields-example.json` shows their
format using fictional data. Read the actual document type and values from the
issued PDF; don't infer them from a booking or a successful Stripe charge.

| Field | Value |
| --- | --- |
| `first_name` | Customer's first name; use `Olá,` if unknown, not a guessed name |
| `document_label` | `receipt` for Recibo; `invoice` for Fatura; `invoice-receipt` for Fatura-Recibo |
| `document_number` | Exact number on the issued PDF |
| `document_date` | Issue date on the PDF, written clearly, e.g. `14 September 2026` |
| `total` | Total and currency as stated on the PDF, e.g. `€25.00` |

Subject: `Your Portuguese lesson {{document_label}} — {{document_number}}`

For HTML substitutions escape `&`, `<`, `>`, double and single quotes. Preserve
accents. Plain-text substitutions should remain plain text. Reject unresolved
`{{...}}` fields. The example field values must never be used for a real customer.

## Gmail through Codex

Use the Gmail connector's current tool schema. Verify its signed-in sender is
`aprenderportugues.ines@gmail.com`; don't use Dan's Gmail link ID. If that account
is not connected, have Inês connect it instead of changing the sender header.

The Gmail `create_draft` / `send_email` tools accept a MIME tree:

- `multipart/mixed`
  - `multipart/alternative`
    - `text/plain`, UTF-8, filled receipt-template.txt
    - `text/html`, UTF-8, filled receipt-template.html
  - `application/pdf`, disposition `attachment`, original PDF filename and
    base64url-encoded original PDF bytes

Put text in `body.content` and PDF bytes in `body.base64_url_content`. Do not
send the PDF's local path as attachment content. Use the actual verified
customer email as `to`. Do not BCC other customers or send a receipt to a
different address based solely on its filename.

The HTML template loads the banner from
https://portuguesewithines.com/email/banner.png. `banner.png` is included for
offline previews or an inline-image implementation. Don't replace its URL with
a local path in a customer email. If remote images are blocked, the receipt
details and message remain readable as real text.

If Codex is using Gmail's browser interface instead of the connector, paste the
rendered email, not its HTML source, and inspect the saved draft before sending.

Keep the existing send ledger. Record the official document number, recipient
and returned Gmail message ID only after a confirmed send. If sending times out,
check Sent before retrying. Do not mark a draft as sent. This kit adds styling;
it does not grant new permission to issue documents or email customers.

## Files

- receipt-template.html / receipt-template.txt — customer email templates
- example.html — local rendered example with fictional details
- example-desktop.png / example-mobile.png — example previews
- banner.png — matching brand header, 1120 × 264 pixels
- fields-example.json — fictional field examples

Editable design and generator live in the Portuguese with Inês website
repository. Regenerate with `node scripts/build-receipt-email-kit.mjs OUTPUT_DIR`.
