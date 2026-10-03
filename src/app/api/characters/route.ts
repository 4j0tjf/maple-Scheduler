import { prisma } from "@/lib/prisma";
import { CHARACTER_NAME } from "@/services/accounts";
import { denied, json, LOGIN_REQUIRED, readJson, sameSite, sessionAccount } from "@/services/access";
import { apiKey, lookupCharacter, syncCharacter, syncError } from "@/services/character-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 계정 하나에 등록할 수 있는 캐릭터 수. */
const MAX_CHARACTERS = 60;
const MEMO_MAX = 2000;
const PUBLIC = { id: true, name: true, level: true, className: true, world: true, image: true, memo: true, position: true, syncedAt: true } as const;
const list = (accountId: string) => prisma.character.findMany({ where: { accountId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: PUBLIC });

/** 로그인한 계정의 캐릭터 목록(탭·드롭다운). 이미지·레벨은 넥슨 API에서 받아 둔 값이다. */
export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    return json({ characters: await list(account.id), nexon: !!apiKey() });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}

/**
 * 캐릭터 등록. 넥슨 API로 그 이름의 캐릭터를 찾아 이미지·레벨·직업·월드를 저장하고, 보스 상태도 바로 받아 둔다.
 * 서버에 NEXON_API_KEY가 없으면 이름만 등록한다.
 */
export async function POST(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ name?: unknown }>(request);
  const name = typeof body?.name === "string" ? body.name.replace(/\s/g, "") : "";
  if (!CHARACTER_NAME.test(name)) return denied("캐릭터명은 한글·영문·숫자 2~12자입니다.", 400);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const count = await prisma.character.count({ where: { accountId: account.id } });
    if (count >= MAX_CHARACTERS) return denied(`캐릭터는 ${MAX_CHARACTERS}명까지 등록할 수 있습니다.`, 400);
    if (await prisma.character.findUnique({ where: { accountId_name: { accountId: account.id, name } }, select: { id: true } })) return denied("이미 등록한 캐릭터입니다.", 409);
    const key = apiKey();
    let found: Awaited<ReturnType<typeof lookupCharacter>> = null;
    if (key) {
      try { found = await lookupCharacter(name, key); }
      catch (error) { return denied(`지금 넥슨 API로 캐릭터를 확인할 수 없습니다. 잠시 후 다시 등록하세요. (${syncError(error)})`, 503); }
      if (!found) return denied("넥슨에서 찾을 수 없는 캐릭터명입니다. 게임의 캐릭터명을 정확히 입력하세요.", 404);
    }
    const last = await prisma.character.aggregate({ where: { accountId: account.id }, _max: { position: true } });
    const basic = found?.basic;
    const character = await prisma.character.create({ data: { accountId: account.id, name: basic?.name ?? name, ocid: found?.ocid ?? null,
      level: basic?.level ?? null, className: basic?.className ?? null, world: basic?.world ?? null, image: basic?.image ?? null,
      syncedAt: found ? new Date() : null, position: (last._max.position ?? -1) + 1 }, select: { ...PUBLIC, ocid: true, bossSyncedAt: true } });
    const warning = key ? await syncCharacter(character, key, true) : null;
    const { ocid: _o, bossSyncedAt: _b, ...view } = character; void _o; void _b;
    return json({ character: view, warning }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return denied("이미 등록한 캐릭터입니다.", 409);
    return denied("저장소에 연결할 수 없습니다.", 503);
  }
}

/** ?id=<캐릭터> 메모 저장(memo) 또는 순서 바꾸기(order: 캐릭터 id 전체 목록, id 없이). */
export async function PATCH(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const id = new URL(request.url).searchParams.get("id");
  const body = await readJson<{ memo?: unknown; order?: unknown }>(request, 64_000);
  if (!body) return denied("요청 형식이 올바르지 않습니다.", 400);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    if (Array.isArray(body.order)) {
      const mine = new Set((await list(account.id)).map(row => row.id));
      const order = body.order.filter((value): value is string => typeof value === "string" && mine.has(value));
      if (order.length !== mine.size || new Set(order).size !== order.length) return denied("캐릭터 순서가 올바르지 않습니다.", 400);
      await prisma.$transaction(order.map((characterId, position) => prisma.character.update({ where: { id: characterId }, data: { position } })));
      return json({ characters: await list(account.id) });
    }
    if (typeof body.memo !== "string" || !id) return denied("요청 형식이 올바르지 않습니다.", 400);
    if (body.memo.length > MEMO_MAX) return denied(`메모는 ${MEMO_MAX.toLocaleString("ko-KR")}자까지 저장합니다.`, 400);
    const updated = await prisma.character.updateMany({ where: { id, accountId: account.id }, data: { memo: body.memo } });
    if (!updated.count) return denied("캐릭터를 찾을 수 없습니다.", 404);
    return json({ ok: true });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}

/** ?id=<캐릭터> 등록 해제. 그 캐릭터의 보스 설정·처치 기록·사냥 기록이 함께 지워진다. */
export async function DELETE(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const id = new URL(request.url).searchParams.get("id"); if (!id) return denied("캐릭터 id가 없습니다.", 400);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const deleted = await prisma.character.deleteMany({ where: { id, accountId: account.id } });
    if (!deleted.count) return denied("캐릭터를 찾을 수 없습니다.", 404);
    await prisma.huntImport.deleteMany({ where: { characterId: id } });
    return json({ ok: true });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}
