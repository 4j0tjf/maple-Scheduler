import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;
/** 로그인 아이디: 영문 소문자로 시작하는 영문·숫자·밑줄 4~20자. 대문자로 넣어도 소문자로 저장한다. */
export const USERNAME = /^[a-z][a-z0-9_]{3,19}$/;
export const PASSWORD = { min: 6, max: 72 };
export const CHARACTER_NAME = /^[가-힣A-Za-z0-9]{2,12}$/;
/** 로그인 유지 기간. 쿠키와 서명 둘 다 이 시간이 지나면 끝난다. */
export const SESSION_MS = 30 * 24 * 3600_000;
export const SESSION_COOKIE = "maple_scheduler_session";

export const normalizeUsername = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
export async function hashPassword(password: string) {
  const salt = randomBytes(16); const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  return timingSafeEqual(await scrypt(password, Buffer.from(salt, "base64"), expected.length), expected);
}

/**
 * 세션 토큰은 계정의 비밀번호 해시로 서명한다.
 * 서버에 별도 비밀키가 없어도 되고, 비밀번호를 바꾸면 기존 로그인이 모두 끊긴다.
 */
const sign = (accountId: string, expires: number, key: string) =>
  createHmac("sha256", key).update(`scheduler.${accountId}.${expires}`).digest("base64url");
export function issueToken(accountId: string, passwordHash: string, now = Date.now()) {
  const expires = now + SESSION_MS;
  return { token: `sched.${accountId}.${expires}.${sign(accountId, expires, passwordHash)}`, expiresAt: expires };
}
export function readToken(token: string) {
  const [prefix, accountId, expires, signature, extra] = token.split(".");
  if (prefix !== "sched" || !accountId || !/^\d{1,15}$/.test(expires ?? "") || !signature || extra !== undefined) return null;
  return { accountId, expires: Number(expires), signature };
}
export function tokenValid(parsed: NonNullable<ReturnType<typeof readToken>>, passwordHash: string, now = Date.now()) {
  if (parsed.expires <= now) return false;
  const expected = Buffer.from(sign(parsed.accountId, parsed.expires, passwordHash)); const actual = Buffer.from(parsed.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
/** 요청의 Cookie 헤더에서 이름이 같은 값 하나. */
export function cookieValue(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("="); if (index < 0) continue;
    if (part.slice(0, index).trim() === name) { try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; } }
  }
  return null;
}
/**
 * 세션 쿠키. 스크립트에서 읽을 수 없게(HttpOnly) 하고 /scheduler 아래에만 보낸다.
 * 다른 사이트에서 오는 쓰기 요청은 Origin 확인(sameSite)으로 따로 막는다.
 */
export function sessionCookie(value: string, maxAgeSeconds: number, secure: boolean, path: string) {
  return [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, `Path=${path}`, `Max-Age=${maxAgeSeconds}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}

/** 프로세스 메모리의 시도 기록. 비밀번호 대입과 계정 대량 가입을 늦춘다. */
export class Attempts {
  private log = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  blocked(key: string, now = Date.now()) { return this.recent(key, now).length >= this.limit; }
  add(key: string, now = Date.now()) {
    if (this.log.size > 5000) for (const [k] of this.log) if (!this.recent(k, now).length) this.log.delete(k);
    this.log.set(key, [...this.recent(key, now), now]);
  }
  clear(key: string) { this.log.delete(key); }
  private recent(key: string, now: number) { return (this.log.get(key) ?? []).filter(at => now - at < this.windowMs); }
}
