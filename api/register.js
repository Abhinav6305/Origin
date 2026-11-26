const h = require("./_lib/handlers");
module.exports = require("./_lib/vercel")(h.register, ["POST"]);
