import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { denied, json, LOGIN_REQUIRED, readJson, sameSite, sessionAccount } from "@/services/access";
import { GAHO_MAX_BYTES, readGahoState, staleBase } from "@/services/gaho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 로그인한 계정의 유챔 가호 계산기 값. 저장한 적이 없으면 state: null. */
export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const row = await prisma.gahoState.findUnique({ where: { accountId: account.id } });
    return json({ state: row?.state ?? null, updatedAt: row?.updatedAt.toISOString() ?? null });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}

/**
 * 저장. { state, base } state는 계산기 값 전체, base는 불러온 때의 updatedAt(처음이면 null).
 * 그사이 다른 곳에서 저장했으면 409와 함께 저장본을 돌려준다.
 */
export async function PUT(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ state?: unknown; base?: unknown }>(request, GAHO_MAX_BYTES);
  const state = readGahoState(body?.state);
  if (!state) return denied("계산기 값 형식이 올바르지 않거나 너무 큽니다.", 400);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const saved = await prisma.gahoState.findUnique({ where: { accountId: account.id } });
    if (staleBase(saved?.updatedAt, body?.base)) {
      return json({ error: "다른 기기나 창에서 먼저 저장한 값이 있습니다.", state: saved!.state, updatedAt: saved!.updatedAt.toISOString() }, { status: 409 });
    }
    const value = state as Prisma.InputJsonObject;
    const row = await prisma.gahoState.upsert({ where: { accountId: account.id }, create: { accountId: account.id, state: value }, update: { state: value } });
    return json({ updatedAt: row.updatedAt.toISOString() });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}
