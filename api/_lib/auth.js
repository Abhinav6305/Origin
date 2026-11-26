// Admin auth: email + password login → signed, HttpOnly session cookie.
// Configure with app settings (never commit real values):
//   ADMIN_EMAIL          e.g. origin@stpetershyd.com
//   ADMIN_PASSWORD_HASH  scrypt hash from:  node api/tools/hash-password.js "<password>"
//   SESSION_SECRET       any long random string (signs the session cookie)
const crypto = require("crypto");

const COOKIE = "h2_admin";
const TTL_S = 8 * 60 * 60;                     // sessions last 8 hours

const secret = () => process.env.SESSION_SECRET || "";
const b64u = b => Buffer.from(b).toString("base64url");
const sign = data => crypto.createHmac("sha256", secret()).update(data).digest("base64url");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const key = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `scrypt$${salt}$${key}`;
}
function verifyPassword(password, stored) {
  const [alg, salt, key] = String(stored || "").split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  return safeEq(hashPassword(password, salt).split("$")[2], key);
}

function makeSession(email) {
  const body = b64u(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + TTL_S }));
  return `${body}.${sign(body)}`;
}
function readSession(req) {
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  if (!raw || !secret()) return null;
  const [body, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!body || !sig || !safeEq(sig, sign(body))) return null;
  try { const s = JSON.parse(Buffer.from(body, "base64url").toString()); return s.x > Date.now() / 1000 ? s : null; } catch { return null; }
}
const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

function isAdmin(req) { return !!readSession(req); }
function adminEmail(req) { return readSession(req)?.e || null; }
function configured() { return !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH && secret()); }

// Simple brute-force brake: 5 failed tries per IP → 10-minute lockout (per Functions instance).
const fails = new Map();
function tooMany(ip) { const f = fails.get(ip); return f && f.n >= 5 && Date.now() - f.t < 10 * 60 * 1000; }
function noteFail(ip) { const f = fails.get(ip) || { n: 0, t: 0 }; if (Date.now() - f.t > 10 * 60 * 1000) f.n = 0; f.n++; f.t = Date.now(); fails.set(ip, f); }
function clearFails(ip) { fails.delete(ip); }

module.exports = { isAdmin, adminEmail, configured, verifyPassword, hashPassword, makeSession, cookie, TTL_S, tooMany, noteFail, clearFails, safeEq };
