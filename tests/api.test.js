// API tests against the local store. Run: npm test
const fs = require("fs"), path = require("path"), assert = require("assert");
fs.rmSync(path.join(__dirname, "..", ".localdata"), { recursive: true, force: true });
const h = require("../api/_lib/handlers");

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const member = (i, o = {}) => ({ name: `Person ${i}`, email: `p${i}@spec.edu`, year: "3rd", college: "SPEC Hyderabad", ...o });
const team = (o = {}) => ({ teamName: "Byte Club", teamSize: 3, members: [member(1), member(2), member(3)], ideaTitle: "Smart waste sorting with vision", ...o });
const reg = (data, file = PDF, name = "abs.pdf") => {
  const fd = new FormData(); fd.append("data", JSON.stringify(data));
  if (file) fd.append("abstract", new Blob([file], { type: "application/pdf" }), name);
  return h.register(new Request("http://x/api/register", { method: "POST", body: fd }));
};
const admin = (url, init = {}) => new Request("http://x" + url, init);
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log("  ✓", m); };

(async () => {
  let r = await reg(team()); ok(r.status === 201 && r.jsonBody.status === "under_review", "valid team registers as under review");
  r = await reg(team({ members: [member(9), member(2), member(3)] })); ok(r.status === 409, "duplicate team name blocked");
  r = await reg(team({ teamName: "Other", members: [member(1), member(5), member(6)] })); ok(r.status === 409, "duplicate leader email blocked");
  r = await reg(team({ teamName: "Fours", teamSize: 4 })); ok(r.status === 400, "member count must match team size");
  r = await reg(team({ teamName: "Dupes", members: [member(1, { email: "a@b.co" }), member(2, { email: "a@b.co" }), member(3)] })); ok(r.status === 400 && /different email/.test(r.jsonBody.error), "same email twice in a team blocked");
  r = await reg(team({ teamName: "BadYear", members: [member(11, { year: "5th" }), member(12), member(13)] })); ok(r.status === 400, "invalid year rejected");
  r = await reg(team({ teamName: "NoPdf", members: [member(21), member(22), member(23)] }), Buffer.from("hello"), "a.pdf"); ok(r.status === 400 && /PDF/.test(r.jsonBody.error), "non-PDF upload rejected");
  r = await reg(team({ teamName: "NoFile", members: [member(31), member(32), member(33)] }), null); ok(r.status === 400, "missing abstract rejected");
  r = await reg(team({ teamName: "Big", members: [member(41), member(42), member(43)] }), Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)])); ok(r.status === 400 && /4 MB/.test(r.jsonBody.error), "abstract over 4 MB rejected");
  r = await reg(team({ teamName: "Five Stack", teamSize: 5, members: [1,2,3,4,5].map(i => member(50 + i, { year: ["1st","2nd","3rd","4th","1st"][i-1] })) })); ok(r.status === 201, "5-member team registers");

  process.env.ADMIN_EMAIL = "origin@stpetershyd.com";
  process.env.ADMIN_PASSWORD_HASH = require("../api/_lib/auth").hashPassword("0r!g!n@c0r3");
  process.env.SESSION_SECRET = "test-secret-" + Date.now();
  r = await h.listTeams(admin("/api/manage/teams")); ok(r.status === 401, "signed-out user cannot list teams");
  const login = (email, password, ip = "1.1.1.1") => h.login(admin("/api/manage/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email, password }) }));
  r = await login("origin@stpetershyd.com", "wrong-pass"); ok(r.status === 401, "wrong password rejected");
  r = await login("someone@else.com", "0r!g!n@c0r3"); ok(r.status === 401, "wrong email rejected");
  for (let i = 0; i < 5; i++) await login("x@y.com", "nope", "9.9.9.9");
  r = await login("origin@stpetershyd.com", "0r!g!n@c0r3", "9.9.9.9"); ok(r.status === 429, "5 failed tries lock the IP out");
  r = await login("ORIGIN@stpetershyd.com ", "0r!g!n@c0r3"); ok(r.status === 200 && /HttpOnly/.test(r.headers["Set-Cookie"]), "correct login sets an HttpOnly session cookie");
  const sess = r.headers["Set-Cookie"].split(";")[0];
  const A = { headers: { cookie: sess } };
  r = await h.listTeams(admin("/api/manage/teams", { headers: { cookie: sess.replace(/.$/, "x") } })); ok(r.status === 401, "tampered session cookie rejected");
  r = await h.listTeams(admin("/api/manage/teams", A)); ok(r.status === 200 && r.jsonBody.teams.length === 2, "admin sees 2 registered teams");
  const [t5, t1] = r.jsonBody.teams;   // newest first

  const rev = (id, action, note) => h.review(admin("/api/manage/review", { method: "POST", headers: { ...A.headers, "content-type": "application/json" }, body: JSON.stringify({ id, action, note }) }));
  const status = (ref, email) => h.teamStatus(admin("/api/team/status", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.2" }, body: JSON.stringify({ ref, email }) }));
  const PNG = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(64)]);
  const pay = (ref, email, txnId, file = PNG) => { const fd = new FormData(); fd.append("ref", ref); fd.append("email", email); fd.append("txnId", txnId); if (file) fd.append("proof", new Blob([file]), "shot.png");
    return h.submitPayment(new Request("http://x/api/team/payment", { method: "POST", body: fd, headers: { "x-forwarded-for": "2.2.2.2" } })); };
  process.env.PAYMENT_UPI_ID = "test@upi";

  r = await status(t1.ref, "p1@spec.edu"); ok(r.status === 200 && r.jsonBody.team.round1 === "under_review" && !r.jsonBody.team.upi, "team dashboard shows under review, no payment yet");
  r = await status(t1.ref, "wrong@spec.edu"); ok(r.status === 404, "dashboard needs the right team leader email");
  r = await pay(t1.ref, "p1@spec.edu", "123456789012"); ok(r.status === 409, "payment blocked before selection");
  r = await rev(t1.id, "approve"); ok(r.jsonBody.team.round1 === "approved" && r.jsonBody.team.teamId === null, "approval selects the team, no ID yet");
  r = await status(t1.ref, "P1@SPEC.EDU"); const v = r.jsonBody.team;
  ok(v.fee.amount === 3 * 599 && v.upi.ready && v.upi.qrSvg.startsWith("<svg") && v.upi.link.includes("am=1797.00"), "selected team gets QR for 3 × ₹599 = ₹1797");
  r = await status(t5.ref, "p51@spec.edu"); ok(r.jsonBody.team.fee.amount === 5 * 599, "5-member team pays ₹2995");
  r = await pay(t1.ref, "p1@spec.edu", "12"); ok(r.status === 400, "short transaction ID rejected");
  r = await pay(t1.ref, "p1@spec.edu", "123456789012", Buffer.from("not an image")); ok(r.status === 400, "non-image screenshot rejected");
  r = await pay(t1.ref, "p1@spec.edu", "123456789012"); ok(r.status === 200 && r.jsonBody.team.payment.status === "submitted", "payment proof + transaction ID submitted");
  r = await pay(t1.ref, "p1@spec.edu", "999999999999"); ok(r.status === 409, "can't submit payment twice while pending");
  await rev(t5.id, "approve");
  r = await pay(t5.ref, "p51@spec.edu", "123456789012"); ok(r.status === 409, "same transaction ID can't be reused by another team");
  r = await h.getPaymentProof(admin("/api/manage/payment-proof?id=" + t1.id, A)); ok(r.status === 200 && r.headers["Content-Type"] === "image/png", "admin can open the payment screenshot");
  r = await rev(t1.id, "pay_reject", "Amount mismatch"); ok(r.jsonBody.team.payment.status === "rejected" && r.jsonBody.team.teamId === null, "admin can reject a payment, no ID issued");
  r = await status(t1.ref, "p1@spec.edu"); ok(r.jsonBody.team.payment.note === "Amount mismatch" && r.jsonBody.team.upi.ready, "team sees the reason and can pay again");
  r = await pay(t1.ref, "p1@spec.edu", "223456789012"); ok(r.status === 200, "team resubmits payment");
  r = await rev(t1.id, "pay_verify"); ok(r.jsonBody.team.payment.status === "verified" && r.jsonBody.team.teamId === "HACK2-001", "verified payment issues HACK2-001");
  r = await pay(t5.ref, "p51@spec.edu", "323456789012"); await rev(t5.id, "pay_verify");
  r = await status(t5.ref, "p51@spec.edu"); ok(r.jsonBody.team.teamId === "HACK2-002" && r.jsonBody.team.payment.status === "verified", "second verified team gets HACK2-002 on its dashboard");
  r = await rev(t1.id, "reject"); ok(r.status === 409, "a paid team can't be rejected by mistake");
  r = await h.getAbstract(admin("/api/manage/abstract?id=" + t1.id, A)); ok(r.status === 200 && r.headers["Content-Type"] === "application/pdf" && r.body.subarray(0,5).toString() === "%PDF-", "admin can open the abstract PDF");
  ok(h.formatTeamId(42) === "HACK2-042" && h.formatTeamId(120) === "HACK2-120", "ID format HACK2-### pads to 3 digits");
  console.log(`\n${pass} checks passed`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
