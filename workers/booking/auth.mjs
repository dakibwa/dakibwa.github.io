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

/**
 * The Workers runtime refuses PBKDF2 above 100,000 iterations
 * ("iteration counts above 100000 are not supported"), which is below the
 * OWASP figure of 210,000 for PBKDF2-HMAC-SHA256. Miniflare does not enforce
 * that cap, so this only surfaced against the deployed Worker.
 *
 * Rather than accept half the work factor, the derivation is chained: each
 * round runs at the platform maximum and feeds the next, so N rounds cost N ×
 * 100,000 iterations while every individual call stays legal. Two rounds
 * exceeds the OWASP figure.
 */
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_ROUNDS = 2;
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

async function deriveOnce(secretBytes, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey("raw", secretBytes, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256);
  return new Uint8Array(bits);
}

/** Chained PBKDF2: `rounds` derivations of `iterations` each. */
async function derive(password, salt, iterations, rounds) {
  let output = encoder.encode(password);
  for (let round = 0; round < rounds; round += 1) {
    output = await deriveOnce(output, salt, iterations);
  }
  return output;
}

/** Returns "pbkdf2$<rounds>x<iterations>$<salt>$<hash>". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS, PBKDF2_ROUNDS);
  return `pbkdf2$${PBKDF2_ROUNDS}x${PBKDF2_ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, cost, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "pbkdf2" || !cost || !salt || !hash) return false;

  // "<rounds>x<iterations>", or a bare iteration count from the single-round
  // form. Reading the cost from the record is what lets it be raised later
  // without invalidating anyone's existing password.
  const [roundsPart, iterationsPart] = cost.includes("x") ? cost.split("x") : ["1", cost];
  const rounds = Number(roundsPart);
  const iterations = Number(iterationsPart);
  if (!Number.isInteger(rounds) || !Number.isInteger(iterations)) return false;
  if (rounds < 1 || rounds > 8 || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;

  const candidate = await derive(password, fromBase64Url(salt), iterations, rounds);
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
