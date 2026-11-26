const { app } = require("@azure/functions");
const h = require("../lib/handlers");

app.http("register", { methods: ["POST"], authLevel: "anonymous", route: "register", handler: h.register });
