import { prisma } from "@/lib/prisma";
import { requestHost, sameSiteRequest, viaPublicTunnel } from "@/lib/site";
import { cookieValue, readToken, SESSION_COOKIE, tokenValid } from "./accounts";

export const denied = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
export const json = (data: unknown, init: ResponseInit = {}) =>
  Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers as Record<string, string> | undefined) } });
export const LOGIN_REQUIRED = "로그인하세요.";

/** 본문을 max 바이트까지만 읽는다. 믿을 수 없는 Content-Length 대신 실제 스트림 길이를 잰다. 넘으면 null. */
export async function readLimited(request: Request, max: number) {
  const reader = request.body?.getReader(); if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
/** JSON 본문. 크기를 넘거나 형식이 틀리면 null. */
export async function readJson<T = Record<string, unknown>>(request: Request, max = 16_000): Promise<T | null> {
  const bytes = await readLimited(request, max); if (!bytes) return null;
  try { return JSON.parse(bytes.toString("utf8")) as T; } catch { return null; }
}

/** 요청 쿠키의 계정 세션. 없거나 만료·위조면 null. */
export async function sessionAccount(request: Request) {
  const parsed = readToken(cookieValue(request.headers.get("cookie"), SESSION_COOKIE) ?? ""); if (!parsed) return null;
  const account = await prisma.account.findUnique({ where: { id: parsed.accountId } });
  return account && tokenValid(parsed, account.passwordHash) ? { id: account.id, username: account.username } : null;
}
/**
 * 사냥 기록 요청의 캐릭터. 화면이 X-Character 헤더로 고른 캐릭터를 보내고, 서버는 로그인한 계정의 캐릭터인지 확인한다.
 * 없거나 다른 계정의 캐릭터면 null.
 */
export async function huntingCharacter(request: Request) {
  const account = await sessionAccount(request); if (!account) return null;
  const id = request.headers.get("x-character") ?? new URL(request.url).searchParams.get("character");
  if (!id) return null;
  const character = await prisma.character.findFirst({ where: { id, accountId: account.id }, select: { id: true, name: true } });
  return character ? { ...character, accountId: account.id } : null;
}
export function sameSite(request: Request): Response | null {
  return sameSiteRequest(request.headers.get("origin"), requestHost(request)) ? null : denied("같은 사이트에서 요청하세요.", 403);
}
/** 시세 수집 요청. 이 PC에서 열었거나 로그인했으면 허용한다. */
export async function huntingAccess(request: Request): Promise<Response | null> {
  const cross = sameSite(request); if (cross) return cross;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost(request) ?? "") && !viaPublicTunnel(request.headers);
  return local || await sessionAccount(request) ? null : denied(LOGIN_REQUIRED, 401);
}
/** HTTPS로 들어온 요청인지. 세션 쿠키에 Secure를 붙일지 정한다(이 PC의 http://127.0.0.1 개발 접속은 아니다). */
export function secureRequest(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https" || viaPublicTunnel(request.headers);
}
/** 접속 주소. 가입 횟수 제한에 쓴다. */
export const clientAddress = (request: Request) =>
  request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
