// Request handlers. Each takes a Fetch-style Request and returns an Azure Functions response object.
//
// Team journey:  register (abstract)  →  admin approves  →  team pays via UPI QR + uploads proof
//                →  admin verifies payment  →  Team ID HACK2-### is issued.
const crypto = require("crypto");
const QRCode = require("qrcode");
const store = require("./store");
const { validateRegistration } = require("./validate");
const auth = require("./auth");
const { isAdmin } = auth;

const MAX_FILE = 4 * 1024 * 1024;   // Vercel caps request bodies at 4.5 MB
const FEE_PER_MEMBER = Number(process.env.FEE_PER_MEMBER || 599);
const json = (status, body) => ({ status, jsonBody: body, headers: { "Cache-Control": "no-store" } });
const formatTeamId = n => "HACK2-" + String(n).padStart(3, "0");
const safeName = s => String(s || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
const strip = ({ _rid, _self, _etag, _attachments, _ts, ...t }) => t;
const clientIp = req => (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();

// Recognise uploads by their first bytes, not by the name the browser sends.
function sniff(buf) {
  const h = buf.subarray(0, 12);
  if (h.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", type: "image/png" };
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

/* ------------------------------------------------------------------ */
/* POST /api/register  (multipart: data = JSON string, abstract = PDF) */
async function register(req) {
  let form;
  try { form = await req.formData(); } catch { return json(400, { error: "Send the registration as a form upload." }); }
  let data;
  try { data = JSON.parse(form.get("data") || ""); } catch { return json(400, { error: "Registration details are missing." }); }

  const { errors, value } = validateRegistration(data);
  if (errors.length) return json(400, { error: errors[0], errors });

  const file = form.get("abstract");
  if (!file || typeof file === "string") return json(400, { error: "Upload your abstract as a PDF." });
  if (file.size > MAX_FILE) return json(400, { error: "The abstract must be 4 MB or smaller." });
  const buf = Buffer.from(await file.arrayBuffer());
  if (sniff(buf)?.ext !== "pdf") return json(400, { error: "The abstract must be a PDF file." });

  const teamNameKey = value.teamName.toLowerCase();
  const leaderEmail = value.members[0].email;
  const dup = await store.findDuplicate(teamNameKey, leaderEmail);
  if (dup) {
    return json(409, { error: dup.teamNameKey === teamNameKey
      ? "That team name is already registered. Choose another name."
      : "This team leader email has already registered a team." });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const ref = crypto.randomBytes(4).toString("hex").toUpperCase();          // 8-char code the team uses on the dashboard
  const doc = {
    id, type: "team", ref,
    teamName: value.teamName, teamNameKey, teamSize: value.teamSize,
    leaderEmail, members: value.members,
    ideaTitle: value.ideaTitle,
    abstract: { blobName: `${id}.pdf`, fileName: safeName(file.name), size: buf.length, uploadedAt: now },
    round1: "under_review",                                                  // under_review | approved | rejected
    payment: { status: "none" },                                             // none | submitted | verified | rejected
    teamId: null,                                                            // HACK2-### once payment is verified
    createdAt: now, reviewedAt: null, reviewedBy: null,
  };
  await store.saveFile(doc.abstract.blobName, buf, "application/pdf");
  await store.createTeam(doc);
  return json(201, { ok: true, reference: ref, teamName: doc.teamName, status: doc.round1 });
}

/* ------------------------------------------------------------------ */
/* Team dashboard: the team proves who it is with reference code + team-leader email. */
const lookups = new Map();     // brake on guessing: 20 failed lookups per IP per 10 min
function lookupBlocked(ip) { const f = lookups.get(ip); return f && f.n >= 20 && Date.now() - f.t < 600000; }
function lookupFail(ip) { const f = lookups.get(ip) || { n: 0, t: 0 }; if (Date.now() - f.t > 600000) f.n = 0; f.n++; f.t = Date.now(); lookups.set(ip, f); }

async function findTeamFor(ref, email, ip) {
  if (lookupBlocked(ip)) return { error: json(429, { error: "Too many attempts. Try again in 10 minutes." }) };
  const R = String(ref || "").trim().toUpperCase(), E = String(email || "").trim().toLowerCase();
  if (!/^[0-9A-F]{8}$/.test(R) || !E) { lookupFail(ip); return { error: json(404, { error: "Check your reference code and team leader email." }) }; }
  const team = await store.findByRef(R);
  if (!team || !auth.safeEq(team.leaderEmail, E)) { lookupFail(ip); return { error: json(404, { error: "No team found with that reference code and team leader email." }) }; }
  return { team };
}

function upiLink(team, amount) {
  const pa = process.env.PAYMENT_UPI_ID, pn = process.env.PAYMENT_PAYEE_NAME || "ORIGIN SPEC";
  const p = new URLSearchParams({ pa, pn, am: amount.toFixed(2), cu: "INR", tn: `HACK2 ${team.ref} ${team.teamName}`.slice(0, 50) });
  return "upi://pay?" + p.toString().replace(/\+/g, "%20");
}

async function teamView(team) {
  const amount = team.teamSize * FEE_PER_MEMBER;
  const v = {
    ref: team.ref, teamName: team.teamName, teamSize: team.teamSize, ideaTitle: team.ideaTitle,
    leaderEmail: team.leaderEmail, members: team.members.map(m => ({ name: m.name, role: m.role })),
    round1: team.round1, teamId: team.teamId || null,
    payment: { status: team.payment?.status || "none", txnId: team.payment?.txnId || null, submittedAt: team.payment?.submittedAt || null, note: team.payment?.note || null },
    fee: { perMember: FEE_PER_MEMBER, amount },
    createdAt: team.createdAt,
  };
  const canPay = team.round1 === "approved" && ["none", "rejected"].includes(v.payment.status);
  if (canPay) {
    if (!process.env.PAYMENT_UPI_ID) v.upi = { ready: false };
    else {
      const link = upiLink(team, amount);
      v.upi = { ready: true, id: process.env.PAYMENT_UPI_ID, payee: process.env.PAYMENT_PAYEE_NAME || "ORIGIN SPEC", link,
        qrSvg: await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
        testMode: process.env.PAYMENT_TEST_MODE === "1" };
    }
  }
  return v;
}

/* POST /api/team/status  { ref, email } */
async function teamStatus(req) {
  let b; try { b = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const { team, error } = await findTeamFor(b?.ref, b?.email, clientIp(req));
  if (error) return error;
  return json(200, { team: await teamView(team) });
}

/* POST /api/team/payment  (multipart: ref, email, txnId, proof = screenshot image or PDF) */
async function submitPayment(req) {
  let form; try { form = await req.formData(); } catch { return json(400, { error: "Send the payment details as a form upload." }); }
  const { team, error } = await findTeamFor(form.get("ref"), form.get("email"), clientIp(req));
  if (error) return error;
  if (team.round1 !== "approved") return json(409, { error: "Payment opens only after your abstract is selected." });
  if (!["none", "rejected"].includes(team.payment?.status || "none")) return json(409, { error: "Payment details were already submitted for this team." });

  const txnId = String(form.get("txnId") || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8,35}$/.test(txnId)) return json(400, { error: "Enter the UPI transaction ID / UTR exactly as shown in your payment app (letters and numbers only)." });
  const other = await store.findByTxn(txnId);
  if (other && other.id !== team.id) return json(409, { error: "This transaction ID has already been used by another team." });

  const file = form.get("proof");
  if (!file || typeof file === "string") return json(400, { error: "Upload the payment screenshot." });
  if (file.size > MAX_FILE) return json(400, { error: "The screenshot must be 4 MB or smaller." });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return json(400, { error: "The screenshot must be a JPG, PNG, WEBP or PDF file." });

  const now = new Date().toISOString();
  const blobName = `${team.id}-payment-${Date.now()}.${kind.ext}`;
  await store.saveFile(blobName, buf, kind.type);
  const history = [...(team.payment?.history || [])];
  if (team.payment?.txnId) history.push({ txnId: team.payment.txnId, status: team.payment.status, note: team.payment.note || null });
  team.payment = { status: "submitted", amount: team.teamSize * FEE_PER_MEMBER, txnId, proof: { blobName, type: kind.type, fileName: safeName(file.name), size: buf.length }, submittedAt: now, history };
  await store.updateTeam(team);
  return json(200, { ok: true, team: await teamView(team) });
}

/* ------------------------------------------------------------------ */
/* Admin */
async function listTeams(req) {
  if (!isAdmin(req)) return json(401, { error: "Please sign in." });
  return json(200, { teams: (await store.listTeams()).map(strip), feePerMember: FEE_PER_MEMBER });
}

async function sendFile(req, pick) {
  if (!isAdmin(req)) return json(401, { error: "Please sign in." });
  const id = new URL(req.url).searchParams.get("id");
  const team = id && await store.getTeam(id);
  if (!team) return json(404, { error: "Team not found." });
  const f = pick(team);
  if (!f) return json(404, { error: "File not found." });
  const buf = await store.readFile(f.blobName);
  const ext = f.type === "application/pdf" ? "pdf" : f.type.split("/")[1].replace("jpeg", "jpg");
  return { status: 200, body: buf, headers: {
    "Content-Type": f.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${team.teamName.replace(/[^\w\- ]+/g, "")} - ${f.label}.${ext}"`,
  } };
}
/* GET /api/manage/abstract?id=  and  /api/manage/payment-proof?id= */
const getAbstract = req => sendFile(req, t => t.abstract && { ...t.abstract, type: "application/pdf", label: "abstract" });
const getPaymentProof = req => sendFile(req, t => t.payment?.proof && { ...t.payment.proof, label: "payment" });

/* POST /api/manage/review  { id, action, note? }
   action: approve | reject | reset            (Round 1 abstract)
           pay_verify | pay_reject             (payment; verify issues the Team ID) */
async function review(req) {
  if (!isAdmin(req)) return json(401, { error: "Please sign in." });
  let body; try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const { id, action, note } = body || {};
  const team = id && await store.getTeam(id);
  if (!team) return json(404, { error: "Team not found." });
  team.payment ||= { status: "none" };

  switch (action) {
    case "approve": team.round1 = "approved"; break;
    case "reject":
      if (team.payment.status === "verified") return json(409, { error: "This team's payment is already verified. It can't be rejected now." });
      team.round1 = "rejected"; break;
    case "reset":
      if (team.payment.status === "verified") return json(409, { error: "This team's payment is already verified." });
      team.round1 = "under_review"; break;
    case "pay_verify":
      if (team.payment.status !== "submitted") return json(409, { error: "There's no submitted payment to verify." });
      team.payment.status = "verified"; team.payment.verifiedAt = new Date().toISOString(); team.payment.note = null;
      if (!team.teamId) team.teamId = formatTeamId(await store.nextTeamNumber());          // permanent once issued
      break;
    case "pay_reject":
      if (team.payment.status !== "submitted") return json(409, { error: "There's no submitted payment to reject." });
      team.payment.status = "rejected"; team.payment.note = String(note || "").slice(0, 200) || "Payment could not be verified. Please check and submit again.";
      break;
    default: return json(400, { error: "Unknown action." });
  }
  team.reviewedAt = new Date().toISOString();
  team.reviewedBy = auth.adminEmail(req) || "admin";
  return json(200, { team: strip(await store.updateTeam(team)) });
}

/* POST /api/manage/login  { email, password } → sets session cookie */
async function login(req) {
  if (!auth.configured()) return json(500, { error: "Admin login isn't configured on the server yet." });
  const ip = clientIp(req);
  if (auth.tooMany(ip)) return json(429, { error: "Too many attempts. Try again in 10 minutes." });
  let b; try { b = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const email = String(b?.email || "").trim().toLowerCase();
  const okEmail = auth.safeEq(email, String(process.env.ADMIN_EMAIL).trim().toLowerCase());
  const okPass = auth.verifyPassword(String(b?.password || ""), process.env.ADMIN_PASSWORD_HASH);
  if (!okEmail || !okPass) { auth.noteFail(ip); return json(401, { error: "Wrong email or password." }); }
  auth.clearFails(ip);
  return { status: 200, jsonBody: { ok: true, email }, headers: { "Set-Cookie": auth.cookie(auth.makeSession(email), auth.TTL_S), "Cache-Control": "no-store" } };
}
async function logout() { return { status: 200, jsonBody: { ok: true }, headers: { "Set-Cookie": auth.cookie("", 0), "Cache-Control": "no-store" } }; }
async function me(req) { const email = auth.adminEmail(req); return email ? json(200, { email }) : json(401, { error: "Not signed in." }); }

module.exports = { register, teamStatus, submitPayment, listTeams, getAbstract, getPaymentProof, review, login, logout, me, formatTeamId, FEE_PER_MEMBER };
