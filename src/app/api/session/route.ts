import { BASE_PATH } from "@/base-path";
import { prisma } from "@/lib/prisma";
import { Attempts, hashPassword, issueToken, normalizeUsername, PASSWORD, SESSION_MS, sessionCookie, USERNAME, verifyPassword } from "@/services/accounts";
import { clientAddress, denied, json, readJson, sameSite, secureRequest, sessionAccount } from "@/services/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 아이디별 비밀번호 실패 5회/10분, 접속 주소별 가입 5회/1시간.
const failures = new Attempts(5, 10 * 60_000);
const signups = new Attempts(5, 3600_000);

/** 지금 로그인한 계정. 로그인 전이면 account: null(200)이다. */
export async function GET(request: Request) {
  try { return json({ account: await sessionAccount(request) }); }
  catch { return denied("계정 저장소에 연결할 수 없습니다.", 503); }
}

/**
 * 로그인(mode: "login")과 회원가입(mode: "signup"). 아이디와 비밀번호만 받는다.
 * 성공하면 30일 동안 유지되는 세션 쿠키를 준다. 비밀번호 원문은 저장하지 않는다.
 */
export async function POST(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ mode?: unknown; username?: unknown; password?: unknown }>(request);
  const username = normalizeUsername(body?.username);
  const password = typeof body?.password === "string" ? body.password : "";
  const signup = body?.mode === "signup";
  if (!USERNAME.test(username)) return denied("아이디는 영문·숫자로 시작하는 4~40자이며 영문·숫자와 . _ - @ 만 쓸 수 있습니다.", 400);
  if (password.length < PASSWORD.min || password.length > PASSWORD.max) return denied(`비밀번호는 ${PASSWORD.min}~${PASSWORD.max}자입니다.`, 400);
  try {
    let account;
    if (signup) {
      const client = clientAddress(request);
      if (signups.blocked(client)) return denied("가입 요청이 많습니다. 잠시 후 다시 시도하세요.", 429);
      if (await prisma.account.findUnique({ where: { username }, select: { id: true } })) return denied("이미 사용 중인 아이디입니다.", 409);
      signups.add(client);
      account = await prisma.account.create({ data: { username, passwordHash: await hashPassword(password) } });
    } else {
      if (failures.blocked(username)) return denied("비밀번호를 여러 번 틀렸습니다. 10분 뒤 다시 시도하세요.", 429);
      account = await prisma.account.findUnique({ where: { username } });
      // 없는 아이디와 틀린 비밀번호를 같은 문구로 알린다(가입된 아이디를 알아내지 못하게).
      if (!account || !await verifyPassword(password, account.passwordHash)) { failures.add(username); return denied("아이디 또는 비밀번호가 맞지 않습니다.", 401); }
      failures.clear(username);
    }
    const session = issueToken(account.id, account.passwordHash);
    return json({ account: { id: account.id, username: account.username } }, { status: signup ? 201 : 200,
      headers: { "Set-Cookie": sessionCookie(session.token, Math.floor(SESSION_MS / 1000), secureRequest(request), BASE_PATH) } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return denied("이미 사용 중인 아이디입니다.", 409);
    return denied("계정 저장소에 연결할 수 없습니다.", 503);
  }
}

/** 로그아웃. 쿠키를 지운다. */
export async function DELETE(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0, secureRequest(request), BASE_PATH) } });
}
