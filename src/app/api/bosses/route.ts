import { prisma } from "@/lib/prisma";
import { findBoss, isDifficulty, levelOf, maxPartyOf } from "@/data/bosses";
import { denied, json, LOGIN_REQUIRED, readJson, sameSite, sessionAccount } from "@/services/access";
import { apiKey, syncCharacter } from "@/services/character-sync";
import { monthStart, periodOf, weekStart } from "@/services/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 계정의 모든 캐릭터의 주간 보스 상태. 넥슨 스케줄러 저장본이 5분보다 오래됐으면 새로 받는다(?refresh=1이면 30초).
 * ?character=<id>를 주면 그 캐릭터만 새로 받는다. 이번 주·이번 달 처치 기록과 보스 설정을 함께 돌려준다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url); const force = url.searchParams.get("refresh") === "1"; const only = url.searchParams.get("character");
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const key = apiKey(); const now = Date.now();
    const rows = await prisma.character.findMany({ where: { accountId: account.id }, select: { id: true, name: true, ocid: true, syncedAt: true, bossSyncedAt: true } });
    const errors = new Map<string, string>();
    if (key) await Promise.all(rows.filter(row => !only || row.id === only).map(async row => {
      const error = await syncCharacter(row, key, force, now); if (error) errors.set(row.id, error);
    }));
    const ids = rows.map(row => row.id);
    const [characters, settings, clears] = await Promise.all([
      prisma.character.findMany({ where: { id: { in: ids } }, select: { id: true, level: true, image: true, className: true, world: true, bossState: true, bossSyncedAt: true } }),
      prisma.bossSetting.findMany({ where: { characterId: { in: ids } } }),
      prisma.bossClear.findMany({ where: { characterId: { in: ids }, period: { in: [weekStart(now), monthStart(now)] } } }),
    ]);
    return json({ now, nexon: !!key, characters: characters.map(character => ({
      id: character.id, level: character.level, image: character.image, className: character.className, world: character.world,
      state: character.bossState, syncedAt: character.bossSyncedAt?.getTime() ?? null, error: errors.get(character.id) ?? null,
      settings: Object.fromEntries(settings.filter(row => row.characterId === character.id).map(row => [row.boss, { difficulty: row.difficulty, partySize: row.partySize, added: row.added, hidden: row.hidden }])),
      clears: Object.fromEntries(clears.filter(row => row.characterId === character.id && row.period === periodOf(findBoss(row.boss)?.cycle ?? "weekly", now))
        .map(row => [row.boss, { period: row.period, difficulty: row.difficulty, partySize: row.partySize, price: Number(row.price), source: row.source }])),
    })) });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}

async function ownCharacter(request: Request, id: unknown) {
  const account = await sessionAccount(request); if (!account) return { error: denied(LOGIN_REQUIRED, 401) };
  if (typeof id !== "string") return { error: denied("캐릭터 id가 없습니다.", 400) };
  const character = await prisma.character.findFirst({ where: { id, accountId: account.id }, select: { id: true } });
  return character ? { error: null } : { error: denied("캐릭터를 찾을 수 없습니다.", 404) };
}

/**
 * 보스 설정. { character, boss, partySize?, difficulty?, added?, hidden? }
 * 파티 인원을 바꾸면 이번 주기의 처치 기록에도 반영한다.
 * hidden=true는 목록에서 삭제한다. 게임 스케줄러에 등록돼 있어도 빠지며, 직접 추가·고른 난이도도 지운다.
 * hidden=false(되돌리기)나 added=true(보스 추가)는 다시 목록에 보인다.
 */
export async function PATCH(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ character?: unknown; boss?: unknown; partySize?: unknown; difficulty?: unknown; added?: unknown; hidden?: unknown }>(request);
  const boss = findBoss(typeof body?.boss === "string" ? body.boss : null);
  if (!body || !boss) return denied("보스가 올바르지 않습니다.", 400);
  if (body.difficulty !== undefined && body.difficulty !== null && (!isDifficulty(body.difficulty) || !levelOf(boss, body.difficulty))) return denied("이 보스에 없는 난이도입니다.", 400);
  try {
    const { error } = await ownCharacter(request, body.character); if (error) return error;
    const characterId = body.character as string;
    const current = await prisma.bossSetting.findUnique({ where: { characterId_boss: { characterId, boss: boss.key } } });
    const hidden = body.hidden === undefined ? body.added !== true && (current?.hidden ?? false) : body.hidden === true;
    const difficulty = hidden ? null : body.difficulty === undefined ? current?.difficulty ?? null : body.difficulty as string | null;
    const max = maxPartyOf(boss, difficulty ?? boss.levels[0].difficulty);
    const party = body.partySize === undefined ? current?.partySize ?? 1 : Number(body.partySize);
    if (!Number.isInteger(party) || party < 1 || party > Math.max(...boss.levels.map(level => maxPartyOf(boss, level.difficulty)))) return denied(`파티 인원은 1~${max}명입니다.`, 400);
    const data = { difficulty, partySize: Math.min(party, max), added: !hidden && (body.added === undefined ? current?.added ?? false : body.added === true), hidden };
    await prisma.bossSetting.upsert({ where: { characterId_boss: { characterId, boss: boss.key } }, create: { characterId, boss: boss.key, ...data }, update: data });
    if (body.partySize !== undefined) await prisma.bossClear.updateMany({ where: { characterId, boss: boss.key, period: periodOf(boss.cycle, Date.now()) }, data: { partySize: data.partySize } });
    return json({ ok: true, setting: data });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}

/**
 * 처치 직접 체크. { character, boss, difficulty, cleared }
 * 넥슨이 완료로 알려 준 처치(source=api)는 풀 수 없다. 넥슨 반영이 늦을 때 먼저 체크해 두는 용도다.
 */
export async function POST(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const body = await readJson<{ character?: unknown; boss?: unknown; difficulty?: unknown; cleared?: unknown }>(request);
  const boss = findBoss(typeof body?.boss === "string" ? body.boss : null);
  const level = boss && isDifficulty(body?.difficulty) ? levelOf(boss, body!.difficulty as string) : undefined;
  if (!body || !boss || !level) return denied("보스와 난이도가 올바르지 않습니다.", 400);
  try {
    const { error } = await ownCharacter(request, body.character); if (error) return error;
    const characterId = body.character as string; const period = periodOf(boss.cycle, Date.now());
    const where = { characterId_period_boss: { characterId, period, boss: boss.key } };
    const existing = await prisma.bossClear.findUnique({ where });
    if (body.cleared !== true) {
      if (existing?.source === "api") return denied("넥슨 스케줄러에서 완료로 확인된 보스라 해제할 수 없습니다.", 409);
      if (existing) await prisma.bossClear.delete({ where });
      return json({ ok: true, cleared: false });
    }
    if (existing?.source === "api") return json({ ok: true, cleared: true });
    const setting = await prisma.bossSetting.findUnique({ where: { characterId_boss: { characterId, boss: boss.key } } });
    const partySize = Math.min(maxPartyOf(boss, level.difficulty), setting?.partySize ?? 1);
    const data = { difficulty: level.difficulty, partySize, price: BigInt(level.price), source: "manual" };
    await prisma.bossClear.upsert({ where, create: { characterId, period, boss: boss.key, ...data }, update: data });
    return json({ ok: true, cleared: true });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}
