// Single Vercel function for the whole backend (Hobby plan allows max 12 functions per deployment).
// vercel.json rewrites every /api/* request here; Vercel keeps the original path in req.url.
const h = require("./_lib/handlers");
const adapt = require("./_lib/vercel");
const ROUTES = {
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
  const route = ROUTES[path];
  if (!route) { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); return res.end('{"error":"Not found"}'); }
  return route(req, res);
};
