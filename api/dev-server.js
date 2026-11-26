// Local preview without Azure: serves the site and runs the API handlers against a local JSON store.
//   cd api && npm install && npm run dev   ->  http://localhost:4280/hackathon/register.html
// Local-only admin login (real values go in Azure app settings, see DEPLOY-HACKATHON.md).
process.env.ADMIN_EMAIL ??= "origin@stpetershyd.com";
process.env.ADMIN_PASSWORD_HASH ??= "scrypt$c55ba7dbbde3f4977ef9821cedfcbf91$5bca513b9ac1e42b57462acbcec479979add46607d57b36f6801f7b9e5bbf2a4";
process.env.SESSION_SECRET ??= require("crypto").randomBytes(32).toString("hex");
const http = require("http"), fs = require("fs"), path = require("path");
const h = require("./src/lib/handlers");
const ROOT = path.join(__dirname, ".."), PORT = process.env.PORT || 4280;
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".jpg":"image/jpeg", ".mp4":"video/mp4", ".pdf":"application/pdf", ".json":"application/json" };
const routes = { "POST /api/register": h.register, "GET /api/manage/teams": h.listTeams, "GET /api/manage/abstract": h.getAbstract, "POST /api/manage/review": h.review, "POST /api/manage/login": h.login, "POST /api/manage/logout": h.logout, "GET /api/manage/me": h.me };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fn = routes[`${req.method} ${url.pathname}`];
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await fn(new Request(url, { method: req.method, headers: req.headers, body, duplex: "half" })).catch(e => ({ status: 500, jsonBody: { error: e.message } }));
    const headers = { ...(r.headers || {}) };
    let out = r.body;
    if (r.jsonBody !== undefined) { headers["Content-Type"] = "application/json"; out = JSON.stringify(r.jsonBody); }
    res.writeHead(r.status || 200, headers); return res.end(out);
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}/hackathon/register.html  (admin: /hackathon/admin.html)`));
