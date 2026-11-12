import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

function key() {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
  const raw = Buffer.from(encoded, "base64");
  if (raw.length !== 32)
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be a base64 encoded 32-byte key",
    );
  return raw;
}
export function encryptSecret(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decryptSecret<T>(value: string): T {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
export function signState(value: string) {
  const sig = createHmac("sha256", key()).update(value).digest("base64url");
  return `${Buffer.from(value).toString("base64url")}.${sig}`;
}
export function verifyState(signed: string) {
  const [raw, sig] = signed.split(".");
  if (!raw || !sig) return null;
  const value = Buffer.from(raw, "base64url").toString();
  const expected = createHmac("sha256", key()).update(value).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? value
    : null;
}
