import { prisma } from "@/lib/prisma";
import { Attempts, CHARACTER_NAME, verifyPassword } from "@/services/accounts";
import { denied, json, LOGIN_REQUIRED, readJson, sameSite, sessionAccount } from "@/services/access";
import { apiKey, lookupCharacter } from "@/services/character-sync";
import { findLegacyCharacter, importLegacyCharacter, legacyPool } from "@/services/legacy-hunt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 기존 캐릭터 비밀번호 실패 5회/10분(기존 앱의 잠금과 같은 기준).
const failures = new Attempts(5, 10 * 60_000);

/** 가져오기를 쓸 수 있는지와 이 계정이 가져온 기존 캐릭터 목록. */
export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const characters = await prisma.character.findMany({ where: { accountId: account.id }, select: { id: true, name: true } });
    const imports = await prisma.huntImport.findMany({ where: { characterId: { in: characters.map(row => row.id) } }, orderBy: { importedAt: "desc" } });
    return json({ available: !!legacyPool(), imports: imports.map(row => ({ legacyName: row.legacyName, characterId: row.characterId, records: row.records, importedAt: row.importedAt })) });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}

/**
 * 기존 사냥 기록 가져오기. { name, password }는 기존 사냥 기록(/hunting)에서 쓰던 캐릭터명과 그 캐릭터 비밀번호다.
 * 같은 이름의 캐릭터가 이 계정에 없으면 등록한 뒤 기록과 증거 이미지를 옮긴다. 기존 기록은 지우지 않는다.
 * 한 기존 캐릭터는 한 계정으로만 가져갈 수 있고, 같은 계정은 다시 가져와 새 기록을 더할 수 있다.
 */
export async function POST(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ name?: unknown; password?: unknown }>(request);
  const name = typeof body?.name === "string" ? body.name.replace(/\s/g, "") : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!CHARACTER_NAME.test(name) || !password) return denied("기존 사냥 기록의 캐릭터명과 비밀번호를 입력하세요.", 400);
  const pool = legacyPool(); if (!pool) return denied("서버에 HUNT_DATABASE_URL이 없어 기존 기록을 읽을 수 없습니다.", 503);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    if (failures.blocked(name)) return denied("비밀번호를 여러 번 틀렸습니다. 10분 뒤 다시 시도하세요.", 429);
    const legacy = await findLegacyCharacter(pool, name);
    if (!legacy || !await verifyPassword(password, legacy.passwordHash)) { failures.add(name); return denied("기존 사냥 기록의 캐릭터명 또는 비밀번호가 맞지 않습니다.", 401); }
    failures.clear(name);
    const previous = await prisma.huntImport.findUnique({ where: { legacyCharacterId: legacy.id } });
    if (previous) {
      const owner = await prisma.character.findUnique({ where: { id: previous.characterId }, select: { accountId: true } });
      if (owner && owner.accountId !== account.id) return denied("이 캐릭터의 기존 기록은 이미 다른 계정으로 가져갔습니다.", 409);
    }
    let character = await prisma.character.findFirst({ where: { accountId: account.id, name: legacy.name }, select: { id: true, name: true } });
    if (!character) {
      // 이름만 맞으면 등록한다. 넥슨 정보(이미지·레벨)는 받을 수 있으면 같이 받는다.
      const key = apiKey(); const found = key ? await lookupCharacter(legacy.name, key).catch(() => null) : null;
      const last = await prisma.character.aggregate({ where: { accountId: account.id }, _max: { position: true } });
      character = await prisma.character.create({ data: { accountId: account.id, name: legacy.name, ocid: found?.ocid ?? null, level: found?.basic.level ?? null,
        className: found?.basic.className ?? null, world: found?.basic.world ?? null, image: found?.basic.image ?? null, syncedAt: found ? new Date() : null,
        position: (last._max.position ?? -1) + 1 }, select: { id: true, name: true } });
    }
    const result = await importLegacyCharacter(prisma, pool, legacy, character);
    return json({ ok: true, character, ...result });
  } catch { return denied("기존 기록 저장소에 연결할 수 없습니다.", 503); }
}
