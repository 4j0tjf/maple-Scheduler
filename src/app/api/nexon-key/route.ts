import { prisma } from "@/lib/prisma";
import { Attempts } from "@/services/accounts";
import { denied, json, LOGIN_REQUIRED, readJson, sameSite, sessionAccount } from "@/services/access";
import { keyAccepted, keyHint, NEXON_KEY, NexonError, nexonError } from "@/services/nexon";
import { keyHealth } from "@/services/nexon-traffic";
import { readAccountKey, saveAccountKey } from "@/services/nexon-key-store";
import { invalidateAccountRates } from "@/services/rates-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const checks = new Attempts(10, 10 * 60_000);
const status = (key: string | null) => ({ registered: !!key, hint: key ? keyHint(key) : null,
  health: key ? keyHealth(key) : null });

export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    return json(status(await readAccountKey(prisma.account, account.id)));
  } catch { return denied("키 설정을 읽을 수 없습니다. 서버 DB와 암호화 키 설정을 확인하세요.", 503); }
}

/** 등록·교체. 인증한 계정 ID만 사용하며 키 원문은 절대로 응답에 넣지 않는다. */
export async function PUT(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const body = await readJson<{ key?: unknown }>(request);
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!NEXON_KEY.test(key)) return denied("넥슨 Open API 키를 그대로 붙여 넣으세요(공백 없이 16~200자).", 400);
    if (checks.blocked(account.id)) return denied("키 확인 요청이 많습니다. 10분 뒤 다시 시도하세요.", 429);
    checks.add(account.id);
    try {
      if (!await keyAccepted(key)) return denied("넥슨이 받아 주지 않는 키입니다. 내 애플리케이션에서 키를 다시 복사하세요.", 400);
    } catch (error) { return denied(error instanceof NexonError ? nexonError(error.code) : "넥슨 API에 연결할 수 없습니다.", 503); }
    await saveAccountKey(prisma.account, account.id, key);
    invalidateAccountRates(account.id);
    return json(status(key));
  } catch { return denied("키를 저장할 수 없습니다. 서버 DB와 암호화 키 설정을 확인하세요.", 503); }
}

/** 저장된 키 재확인. 새 키를 입력하거나 기존 값을 덮어쓰지 않는다. */
export async function POST(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const key = await readAccountKey(prisma.account, account.id);
    if (!key) return denied("등록한 넥슨 API 키가 없습니다.", 409);
    if (checks.blocked(account.id)) return denied("키 확인 요청이 많습니다. 10분 뒤 다시 시도하세요.", 429);
    checks.add(account.id);
    // 일시 장애도 health에 기록되므로 상태를 반환하고 저장된 키는 유지한다.
    await keyAccepted(key).catch(() => {});
    return json(status(key));
  } catch { return denied("키를 확인할 수 없습니다. 서버 DB와 암호화 키 설정을 확인하세요.", 503); }
}

export async function DELETE(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    await saveAccountKey(prisma.account, account.id, null);
    invalidateAccountRates(account.id);
    return json(status(null));
  } catch { return denied("계정 저장소에 연결할 수 없습니다.", 503); }
}
