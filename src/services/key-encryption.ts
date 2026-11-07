import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
export function encryptionKey() {
  const value = process.env.NEXON_KEY_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("NEXON_KEY_ENCRYPTION_KEY에 32바이트 암호화 키(16진수 64자)를 설정하세요.");
  return Buffer.from(value, "hex");
}
export const keyFingerprint = (key: string) => createHash("sha256").update(key).digest("hex");
export const isEncryptedKey = (value: string) => value.startsWith(PREFIX);
/** 계정 ID를 인증 데이터로 묶어 DB에서 다른 계정으로 암호문을 복사해도 복호화되지 않는다. */
export function encryptKey(value: string, accountId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(accountId));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64url")).join(":");
}
export function decryptKey(value: string, accountId: string) {
  // 무중단 업그레이드를 위해 기존 평문은 읽기만 허용한다. 신규 저장은 반드시 암호화한다.
  if (!isEncryptedKey(value)) return value;
  try {
    const parts = value.slice(PREFIX.length).split(":");
    if (parts.length !== 3) throw new Error();
    const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(Buffer.from(accountId)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch { throw new Error("넥슨 API 키 복호화 실패: 서버 암호화 키와 백업을 확인하세요."); }
}
