// Single Vercel function for the whole backend (Hobby plan allows max 12 functions per deployment).
// vercel.json rewrites every /api/* request here; Vercel keeps the original path in req.url.
let h, adapt, bootError = null;
try { h = require("./_lib/handlers"); adapt = require("./_lib/vercel"); }
catch (e) { bootError = e; console.error("Backend failed to start:", e); }

const send = (res, code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };

/* GET /api/health — shows which settings this deployment can see (never their values) and whether Azure answers */
async function health(req, res) {
  const has = k => !!(process.env[k] && String(process.env[k]).trim());
  const env = {};
  for (const k of ["COSMOS_CONNECTION","STORAGE_CONNECTION","ADMIN_EMAIL","ADMIN_PASSWORD_HASH","SESSION_SECRET","PAYMENT_UPI_ID","PAYMENT_PAYEE_NAME"]) env[k] = has(k) ? "set" : "MISSING";
  const out = { ok: false, env, storage: "not checked" };
  if (bootError) { out.storage = "backend failed to start: " + bootError.message; return send(res, 500, out); }
  try { const store = require("./_lib/store"); out.mode = store.mode; await store.findByRef("__health_check__"); out.storage = "connected"; out.ok = Object.values(env).every(v => v === "set"); }
  catch (e) { out.storage = "error: " + (e.code || e.name || "") + " " + String(e.message || e).split("\n")[0].slice(0, 200); }
  return send(res, out.ok ? 200 : 500, out);
}

const ROUTES = bootError ? {} : {
  "/api/register":             adapt(h.register,        ["POST"]),
  "/api/team/status":          adapt(h.teamStatus,      ["POST"]),
  "/api/team/payment":         adapt(h.submitPayment,   ["POST"]),
  "/api/manage/login":         adapt(h.login,           ["POST"]),
  "/api/manage/logout":        adapt(h.logout,          ["POST"]),
  "/api/manage/me":            adapt(h.me,              ["GET"]),
  "/api/manage/teams":         adapt(h.listTeams,       ["GET"]),
  "/api/manage/review":        adapt(h.review,          ["POST"]),
  "/api/manage/abstract":      adapt(h.getAbstract,     ["GET"]),
  "/api/manage/payment-proof": adapt(h.getPaymentProof, ["GET"]),
};
module.exports = (req, res) => {
  const u = new URL(req.url || "/", "http://x");
  let path = u.pathname.replace(/\/+$/, "");
  const r = u.searchParams.get("__route");                        // set by the vercel.json rewrite
  if (r && !ROUTES[path]) path = "/api/" + r.replace(/^\/+|\/+$/g, "");
  if (path === "/api/health") return health(req, res);
  if (bootError) return send(res, 500, { error: "The server isn't set up yet: " + bootError.message + " After adding them, redeploy." });
  const route = ROUTES[path];
  if (!route) { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); return res.end('{"error":"Not found"}'); }
  return route(req, res);
};
