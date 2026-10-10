/** npm run hash-password -- 'your password'  → values for OWNER_PASSWORD_HASH */
import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error("Usage: npm run hash-password -- 'a password of at least 10 characters'");
  process.exit(1);
}
const hash = bcrypt.hashSync(pw, 12);
console.log(`Vercel env var (paste as is):\n  OWNER_PASSWORD_HASH=${hash}\n`);
console.log(`.env.local (base64, avoids $ expansion):\n  OWNER_PASSWORD_HASH=${Buffer.from(hash).toString("base64")}`);
