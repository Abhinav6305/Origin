// Admin endpoints. "admin" is a reserved Functions route prefix, so these live under /api/manage/*.
const { app } = require("@azure/functions");
const h = require("../lib/handlers");

app.http("manageTeams",    { methods: ["GET"],  authLevel: "anonymous", route: "manage/teams",    handler: h.listTeams });
app.http("manageAbstract", { methods: ["GET"],  authLevel: "anonymous", route: "manage/abstract", handler: h.getAbstract });
app.http("manageReview",   { methods: ["POST"], authLevel: "anonymous", route: "manage/review",   handler: h.review });
app.http("manageLogin",  { methods: ["POST"], authLevel: "anonymous", route: "manage/login",  handler: h.login });
app.http("manageLogout", { methods: ["POST"], authLevel: "anonymous", route: "manage/logout", handler: h.logout });
app.http("manageMe",     { methods: ["GET"],  authLevel: "anonymous", route: "manage/me",     handler: h.me });
