/**
 * A Portuguese tax number (NIF), given optionally for fiscal documents.
 *
 * A private customer's NIF only goes on a fatura-recibo when they ask for it
 * (CIVA art. 36.º n.º 16); otherwise Inês issues it to consumidor final. People
 * paste spaces, dots, hyphens and a "PT" prefix, so those are removed.
 */
export function normaliseNif(value) {
  return String(value ?? "").slice(0, 40).replace(/[\s.-]/g, "").replace(/^PT/i, "");
}

/**
 * Why a normalised NIF would be refused, or null. Empty means none was given.
 * The ninth digit is a mod-11 check digit, which catches most typos before a
 * wrong number reaches a tax document. No NIF starts with 0, so 000000000,
 * which satisfies the check digit, is refused too.
 */
export function nifProblem(nif) {
  if (!nif) return null;
  if (!/^\d{9}$/.test(nif)) return "A NIF has 9 digits. Check it, or leave it blank.";
  const sum = [...nif.slice(0, 8)].reduce((total, digit, index) => total + Number(digit) * (9 - index), 0);
  const check = 11 - (sum % 11);
  const valid = nif[0] !== "0" && (check > 9 ? 0 : check) === Number(nif[8]);
  return valid ? null : "That NIF isn't valid. Check the digits, or leave it blank.";
}
