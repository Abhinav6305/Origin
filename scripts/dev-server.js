// Local preview that behaves like Vercel: serves the site and runs the real files in /api.
//   npm install && npm run dev   ->  http://localhost:3000/hack-a-thon2.0/
// Without Azure settings it stores data in ./.localdata (never used on Vercel).
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), PORT = process.env.PORT || 3000;
process.env.ADMIN_EMAIL ??= "origin@stpetershyd.com";
process.env.ADMIN_PASSWORD_HASH ??= "scrypt$c55ba7dbbde3f4977ef9821cedfcbf91$5bca513b9ac1e42b57462acbcec479979add46607d57b36f6801f7b9e5bbf2a4";
process.env.SESSION_SECRET ??= require("crypto").randomBytes(32).toString("hex");
process.env.PAYMENT_UPI_ID ??= "hackathon-test@upi";        // TEST ONLY
process.env.PAYMENT_PAYEE_NAME ??= "ORIGIN SPEC (TEST)";
process.env.PAYMENT_TEST_MODE ??= "1";
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".jpg":"image/jpeg", ".mp4":"video/mp4",".mp3":"audio/mpeg", ".pdf":"application/pdf", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const redirects = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).redirects || [];

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const r = redirects.find(x => x.source === url.pathname);
  if (r) { res.writeHead(r.permanent ? 308 : 307, { Location: r.destination + url.search }); return res.end(); }
  if (url.pathname.startsWith("/api/")) {
    const file = path.join(ROOT, url.pathname + ".js");
    if (!file.startsWith(path.join(ROOT, "api")) || url.pathname.includes("/_") || !fs.existsSync(file)) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end('{"error":"Not found"}'); }
    return require(file)(req, res);
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}.`)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}/hack-a-thon2.0/   admin: /hack-a-thon2.0/admin.html   team: /hack-a-thon2.0/dashboard.html`));
