import bcrypt from "bcryptjs";

/**
 * OWNER_PASSWORD_HASH holds a bcrypt hash. Because "$" is awkward in .env files, a base64-encoded hash is
 * accepted too (npm run hash-password prints both forms).
 */
export function ownerHash(): string | null {
  const raw = process.env.OWNER_PASSWORD_HASH?.trim();
  if (!raw) return null;
  if (raw.startsWith("$2")) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.startsWith("$2") ? decoded : null;
  } catch {
    return null;
  }
}

export async function verifyOwnerPassword(password: string): Promise<boolean> {
  const hash = ownerHash();
  if (!hash || !password) return false;
  return bcrypt.compare(password, hash);
}
