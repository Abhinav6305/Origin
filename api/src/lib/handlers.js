// Request handlers. Each takes a Fetch-style Request and returns an Azure Functions response object.
const crypto = require("crypto");
const store = require("./store");
const { validateRegistration } = require("./validate");
const auth = require("./auth");
const { isAdmin } = auth;

const MAX_PDF = 5 * 1024 * 1024;
const json = (status, body) => ({ status, jsonBody: body, headers: { "Cache-Control": "no-store" } });
const formatTeamId = n => "HACK2-" + String(n).padStart(3, "0");
const safeName = s => String(s || "abstract.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

/* POST /api/register  (multipart: data = JSON string, abstract = PDF file) */
async function register(req) {
  let form;
  try { form = await req.formData(); } catch { return json(400, { error: "Send the registration as a form upload." }); }

  let data;
  try { data = JSON.parse(form.get("data") || ""); } catch { return json(400, { error: "Registration details are missing." }); }

  const { errors, value } = validateRegistration(data);
  if (errors.length) return json(400, { error: errors[0], errors });

  const file = form.get("abstract");
  if (!file || typeof file === "string") return json(400, { error: "Upload your abstract as a PDF." });
  if (file.size > MAX_PDF) return json(400, { error: "The abstract must be 5 MB or smaller." });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return json(400, { error: "The abstract must be a PDF file." });

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
  const doc = {
    id, type: "team",
    teamName: value.teamName, teamNameKey, teamSize: value.teamSize,
    leaderEmail, members: value.members,
    ideaTitle: value.ideaTitle,
    abstract: { blobName: `${id}.pdf`, fileName: safeName(file.name), size: buf.length, uploadedAt: now },
    round1: "under_review",      // under_review | approved | rejected
    teamId: null,                // HACK2-### once approved
    createdAt: now, reviewedAt: null, reviewedBy: null,
  };
  await store.saveFile(doc.abstract.blobName, buf);
  await store.createTeam(doc);

  return json(201, { ok: true, reference: id.slice(0, 8).toUpperCase(), teamName: doc.teamName, status: doc.round1 });
}

/* GET /api/manage/teams */
async function listTeams(req) {
  if (!isAdmin(req)) return json(401, { error: "Please sign in." });
  const teams = await store.listTeams();
  return json(200, { teams: teams.map(({ _rid, _self, _etag, _attachments, _ts, ...t }) => t) });
}

/* GET /api/manage/abstract?id=... */
async function getAbstract(req) {
  if (!isAdmin(req)) return json(401, { error: "Please sign in." });
  const id = new URL(req.url).searchParams.get("id");
  const team = id && await store.getTeam(id);
  if (!team) return json(404, { error: "Team not found." });
  const buf = await store.readFile(team.abstract.blobName);
  const fname = `${team.teamName.replace(/[^\w\- ]+/g, "")} - abstract.pdf`;
  return { status: 200, body: buf, headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${fname}"`,
    "Cache-Control": "no-store",
  } };
}

/* POST /api/manage/review  { id, action: "approve" | "reject" | "reset" } */
async function review(req) {
  if (!isAdmin(req)) return json(401, { error: "Please sign in." });
  let body; try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const { id, action } = body || {};
  if (!["approve", "reject", "reset"].includes(action)) return json(400, { error: "Unknown action." });
  const team = id && await store.getTeam(id);
  if (!team) return json(404, { error: "Team not found." });

  if (action === "approve") {
    team.round1 = "approved";
    if (!team.teamId) team.teamId = formatTeamId(await store.nextTeamNumber());   // IDs are permanent once given
  } else if (action === "reject") team.round1 = "rejected";
  else team.round1 = "under_review";

  team.reviewedAt = new Date().toISOString();
  team.reviewedBy = auth.adminEmail(req) || "admin";
  const { _rid, _self, _etag, _attachments, _ts, ...saved } = await store.updateTeam(team);
  return json(200, { team: saved });
}

/* POST /api/manage/login  { email, password } → sets session cookie */
async function login(req) {
  if (!auth.configured()) return json(500, { error: "Admin login isn't configured on the server yet." });
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (auth.tooMany(ip)) return json(429, { error: "Too many attempts. Try again in 10 minutes." });
  let b; try { b = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const email = String(b?.email || "").trim().toLowerCase();
  const okEmail = auth.safeEq(email, String(process.env.ADMIN_EMAIL).trim().toLowerCase());
  const okPass = auth.verifyPassword(String(b?.password || ""), process.env.ADMIN_PASSWORD_HASH);
  if (!okEmail || !okPass) { auth.noteFail(ip); return json(401, { error: "Wrong email or password." }); }
  auth.clearFails(ip);
  return { status: 200, jsonBody: { ok: true, email }, headers: { "Set-Cookie": auth.cookie(auth.makeSession(email), auth.TTL_S), "Cache-Control": "no-store" } };
}

/* POST /api/manage/logout */
async function logout() {
  return { status: 200, jsonBody: { ok: true }, headers: { "Set-Cookie": auth.cookie("", 0), "Cache-Control": "no-store" } };
}

/* GET /api/manage/me */
async function me(req) {
  const email = auth.adminEmail(req);
  return email ? json(200, { email }) : json(401, { error: "Not signed in." });
}

module.exports = { register, listTeams, getAbstract, review, login, logout, me, formatTeamId };
