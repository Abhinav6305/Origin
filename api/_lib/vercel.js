// Adapter: Vercel Node function (req, res)  →  our Fetch-style handlers  →  response.
// The handlers return { status, jsonBody | body, headers } (same shape Azure Functions used).
module.exports = function adapt(handler, methods) {
  return async (req, res) => {
    try {
      if (methods && !methods.includes(req.method)) { res.statusCode = 405; res.setHeader("Allow", methods.join(", ")); return res.end(); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const proto = req.headers["x-forwarded-proto"] || "https", host = req.headers.host || "localhost";
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
      const request = new Request(`${proto}://${host}${req.url}`, { method: req.method, headers, body: chunks.length && !["GET", "HEAD"].includes(req.method) ? Buffer.concat(chunks) : undefined, duplex: "half" });
      const out = await handler(request);
      res.statusCode = out.status || 200;
      for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
      if (out.jsonBody !== undefined) { res.setHeader("Content-Type", "application/json; charset=utf-8"); return res.end(JSON.stringify(out.jsonBody)); }
      return res.end(out.body ?? "");
    } catch (e) {
      console.error(e);
      res.statusCode = 500; res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Server error. Please try again." }));
    }
  };
};
