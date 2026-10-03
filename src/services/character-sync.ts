import "server-only";
import { prisma } from "@/lib/prisma";
import { findBoss, levelOf, shareOf } from "@/data/bosses";
import { apiFor, readSchedulerState, type BossState } from "./boss-plan";
import { findOcid, NexonError, nexonError, nexonGet, readBasic, type CharacterBasic } from "./nexon";
import { periodOf } from "./period";

/** 같은 캐릭터의 보스 상태는 이 시간 동안 저장본을 쓴다. 넥슨 데이터도 몇 분 늦게 반영된다. */
export const BOSS_TTL = 5 * 60_000;
/** 새로고침 버튼으로도 이보다 자주 부르지 않는다. */
export const BOSS_MIN_REFRESH = 30_000;
/** 이미지·레벨은 하루에 몇 번이면 충분하다. */
const BASIC_TTL = 3 * 3600_000;

type Row = { id: string; name: string; ocid: string | null; syncedAt: Date | null; bossSyncedAt: Date | null };
export const apiKey = () => process.env.NEXON_API_KEY || null;

export function syncError(error: unknown) {
  if (error instanceof NexonError) return nexonError(error.code);
  return "넥슨 API에 연결할 수 없습니다.";
}
/** 캐릭터명으로 ocid와 기본 정보. 넥슨에 없는 이름이면 null, 그 밖의 오류는 던진다. */
export async function lookupCharacter(name: string, key: string): Promise<{ ocid: string; basic: CharacterBasic } | null> {
  const ocid = await findOcid(name, key); if (!ocid) return null;
  return { ocid, basic: readBasic(await nexonGet<Record<string, unknown>>(`/character/basic?ocid=${encodeURIComponent(ocid)}`, key)) };
}
const basicData = (basic: CharacterBasic, at: Date) => ({ level: basic.level, className: basic.className, world: basic.world, image: basic.image, syncedAt: at });

/**
 * 캐릭터 한 명의 넥슨 정보를 새로 받는다. 기본 정보(이미지·레벨)와 스케줄러의 보스 등록·완료 여부.
 * 이번 주기에 완료로 온 보스는 처치 기록(BossClear, source=api)으로 남겨 다음 주에도 그 주의 수익을 볼 수 있게 한다.
 * force가 아니면 저장본이 BOSS_TTL보다 오래됐을 때만 부른다. 실패하면 이유 문구를 돌려주고 저장본은 그대로 둔다.
 */
export async function syncCharacter(row: Row, key: string, force: boolean, now = Date.now()): Promise<string | null> {
  const age = now - (row.bossSyncedAt?.getTime() ?? 0);
  if (age < (force ? BOSS_MIN_REFRESH : BOSS_TTL)) return null;
  try {
    let ocid = row.ocid;
    const at = new Date(now);
    if (!ocid) {
      const found = await lookupCharacter(row.name, key);
      if (!found) return nexonError("OPENAPI00004");
      ocid = found.ocid;
      await prisma.character.update({ where: { id: row.id }, data: { ocid, ...basicData(found.basic, at) } });
    } else if (force || now - (row.syncedAt?.getTime() ?? 0) > BASIC_TTL) {
      const basic = readBasic(await nexonGet<Record<string, unknown>>(`/character/basic?ocid=${encodeURIComponent(ocid)}`, key));
      await prisma.character.update({ where: { id: row.id }, data: basicData(basic, at) });
    }
    const state = readSchedulerState(await nexonGet(`/scheduler/character-state?ocid=${encodeURIComponent(ocid)}`, key), now);
    await prisma.character.update({ where: { id: row.id }, data: { bossState: state, bossSyncedAt: at } });
    await recordApiClears(row.id, state, now);
    return null;
  } catch (error) {
    // ocid가 바뀌었을 수 있다(닉네임 변경·월드 이전). 다음 동기화에서 이름으로 다시 찾는다.
    if (error instanceof NexonError && ["OPENAPI00003", "OPENAPI00004"].includes(error.code ?? "")) await prisma.character.update({ where: { id: row.id }, data: { ocid: null } }).catch(() => {});
    return syncError(error);
  }
}

/** 넥슨이 완료로 알려 준 보스를 이번 주기의 처치로 저장한다. 직접 체크한 처치는 넥슨 값으로 바꾼다(난이도가 실제와 다를 수 있다). */
export async function recordApiClears(characterId: string, state: BossState, now: number) {
  const settings = new Map((await prisma.bossSetting.findMany({ where: { characterId } })).map(setting => [setting.boss, setting]));
  for (const entry of new Set(state.bosses.filter(item => item.complete && item.boss).map(item => item.boss!))) {
    const boss = findBoss(entry); if (!boss) continue;
    const complete = apiFor(state, boss, now).complete; if (!complete) continue;
    const level = levelOf(boss, complete.difficulty); if (!level) continue;
    const period = periodOf(boss.cycle, now);
    const partySize = settings.get(boss.key)?.partySize ?? 1;
    const data = { difficulty: level.difficulty, price: BigInt(level.price), source: "api" };
    await prisma.bossClear.upsert({ where: { characterId_period_boss: { characterId, period, boss: boss.key } },
      create: { characterId, period, boss: boss.key, partySize, ...data }, update: data });
  }
}
export const crystalShare = (price: bigint | number, party: number) => shareOf(Number(price), party);
