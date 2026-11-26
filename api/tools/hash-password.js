// Prints an ADMIN_PASSWORD_HASH value for the given password.
//   node api/tools/hash-password.js "your password"
const { hashPassword } = require("../src/lib/auth");
const pw = process.argv[2];
if (!pw) { console.error('Usage: node tools/hash-password.js "<password>"'); process.exit(1); }
console.log(hashPassword(pw));
