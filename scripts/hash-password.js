// Prints an ADMIN_PASSWORD_HASH value for the given password.
//   npm run hash-password -- "your password"
const { hashPassword } = require("../api/_lib/auth");
const pw = process.argv[2];
if (!pw) { console.error('Usage: npm run hash-password -- "<password>"'); process.exit(1); }
console.log(hashPassword(pw));
