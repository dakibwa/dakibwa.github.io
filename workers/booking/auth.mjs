/**
 * Student accounts: email and password.
 *
 * Passwords are hashed with PBKDF2-HMAC-SHA256. bcrypt and argon2 are not
 * available in the Workers runtime, and PBKDF2 is what WebCrypto offers
 * natively; the iteration count follows the OWASP guidance for this algorithm.
 * The hash record carries its own algorithm, iteration count and salt, so the
 * cost can be raised later and old hashes still verify.
 */

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 210000;
const SESSION_DAYS = 90;

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

async function derive(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

/** Returns "pbkdf2$<iterations>$<salt>$<hash>". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;

  const candidate = await derive(password, fromBase64Url(salt), Number(iterations));
  return constantTimeEqual(candidate, fromBase64Url(hash));
}

/**
 * Password rules kept deliberately light. Length is what actually matters, and
 * composition rules mostly produce forgotten passwords rather than safer ones.
 */
export function passwordProblem(password) {
  const value = String(password ?? "");
  if (value.length < 8) return "Please choose a password of at least 8 characters.";
  if (value.length > 200) return "That password is too long.";
  if (!value.trim()) return "Please choose a password.";
  return null;
}

export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

// --- Sessions ---------------------------------------------------------------

const keyCache = new Map();

async function hmacKey(secret) {
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign"
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

async function sign(value, secret) {
  return base64Url(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value)));
}

/**
 * A stateless bearer token: "<studentId>.<expiryMs>.<signature>".
 *
 * Stateless means signing out cannot revoke it server-side, which is the
 * trade accepted here: the alternative is a session row read on every request,
 * and the blast radius of a leaked 90-day token for a lesson calendar is small.
 * Changing a password does not invalidate existing tokens either — worth
 * knowing before this is reused for anything more sensitive.
 */
export async function createSession(studentId, secret) {
  const expiry = Date.now() + SESSION_DAYS * 86400000;
  const payload = `${studentId}.${expiry}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function readSession(token, secret) {
  const raw = String(token ?? "");
  const parts = raw.split(".");
  if (parts.length !== 3) return null;

  const [studentId, expiry, signature] = parts;
  const expected = await sign(`${studentId}.${expiry}`, secret);
  if (signature.length !== expected.length) return null;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (mismatch !== 0) return null;
  if (!Number(expiry) || Number(expiry) < Date.now()) return null;

  return studentId;
}

/** Single-use, short-lived token for a password reset link. */
export async function createResetToken(studentId, secret, minutes = 60) {
  const expiry = Date.now() + minutes * 60000;
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(9)));
  const payload = `${studentId}.${expiry}.${nonce}`;
  return `${payload}.${await sign(`reset:${payload}`, secret)}`;
}

export async function readResetToken(token, secret) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 4) return null;

  const [studentId, expiry, nonce, signature] = parts;
  const expected = await sign(`reset:${studentId}.${expiry}.${nonce}`, secret);
  if (signature.length !== expected.length) return null;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (mismatch !== 0) return null;
  if (!Number(expiry) || Number(expiry) < Date.now()) return null;

  return { studentId, nonce };
}
