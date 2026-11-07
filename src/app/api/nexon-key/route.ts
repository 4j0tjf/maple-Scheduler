import { prisma } from "@/lib/prisma";
import { Attempts } from "@/services/accounts";
import { denied, json, LOGIN_REQUIRED, readJson, sameSite, sessionAccount } from "@/services/access";
import { keyAccepted, keyHint, NEXON_KEY, NexonError, nexonError } from "@/services/nexon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 키 확인은 넥슨을 부르므로 계정별 10회/10분으로 막는다(남의 키를 대입해 보는 데 쓰이지 않게).
const checks = new Attempts(10, 10 * 60_000);
const status = (key: string | null) => ({ registered: !!key, hint: key ? keyHint(key) : null });

/** 이 계정의 넥슨 API 키 등록 여부. 키 전체는 돌려주지 않고 앞머리(test_·live_)와 끝 4자만 준다. */
export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const row = await prisma.account.findUnique({ where: { id: account.id }, select: { nexonApiKey: true } });
    return json(status(row?.nexonApiKey ?? null));
  } catch { return denied("계정 저장소에 연결할 수 없습니다.", 503); }
}

/**
 * 넥슨 API 키 등록·바꾸기. { key } 넥슨에 한 번 조회해 받아 주는 키인지 확인한 뒤 저장한다.
 * 이 계정 캐릭터의 넥슨 조회(캐릭터 등록·보스 동기화·지난 날짜 채우기·사냥 효율)는 이 키로 한다.
 */
export async function PUT(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ key?: unknown }>(request);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!NEXON_KEY.test(key)) return denied("넥슨 Open API 키를 그대로 붙여 넣으세요(공백 없이 16자 이상).", 400);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    if (checks.blocked(account.id)) return denied("키 확인 요청이 많습니다. 10분 뒤 다시 시도하세요.", 429);
    checks.add(account.id);
    let accepted: boolean;
    try { accepted = await keyAccepted(key); }
    catch (error) { return denied(`지금 넥슨에서 키를 확인할 수 없습니다. 잠시 후 다시 등록하세요. (${error instanceof NexonError ? nexonError(error.code) : "넥슨 API에 연결할 수 없습니다."})`, 503); }
    if (!accepted) return denied("넥슨이 받아 주지 않는 키입니다. openapi.nexon.com의 내 애플리케이션에서 키를 다시 복사하세요.", 400);
    await prisma.account.update({ where: { id: account.id }, data: { nexonApiKey: key } });
    return json(status(key));
  } catch { return denied("계정 저장소에 연결할 수 없습니다.", 503); }
}

/** 넥슨 API 키 삭제. 이미 받아 둔 캐릭터 정보·처치 기록은 그대로 두고, 그 뒤로는 넥슨에서 새로 받지 않는다. */
export async function DELETE(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    await prisma.account.update({ where: { id: account.id }, data: { nexonApiKey: null } });
    return json(status(null));
  } catch { return denied("계정 저장소에 연결할 수 없습니다.", 503); }
}
