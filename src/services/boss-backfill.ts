import "server-only";
import { prisma } from "@/lib/prisma";
import { readSchedulerState } from "./boss-plan";
import { apiKey, recordApiClears } from "./character-sync";
import { NexonError, nexonGet } from "./nexon";
import { closingDays } from "./period";

/**
 * 사이트를 열지 않은 주의 보스 처치도 기록되게 하는 백필.
 * 넥슨 스케줄러는 date=YYYY-MM-DD로 어제부터 13일 전까지, 그날이 끝난 상태를 돌려준다. 주 마지막 날(수요일)과
 * 달 마지막 날을 조회하면 그 주기의 처치가 모두 들어 있으므로, 그것을 처치 기록(source=api)으로 남긴다.
 * 받은 날짜는 boss_snapshots에 남겨 다시 부르지 않는다. 어제 것은 KST 00:00~02:00 무렵 결산 중(OPENAPI00009)이면 다음에 다시 부른다.
 */
const HOUR = 3600_000;

type Result = { filled: number; pending: number };
/** 캐릭터 한 명의 빠진 날짜를 채운다. 넥슨이 이 캐릭터를 못 찾으면(OPENAPI00003) 남은 날짜는 다음에 다시 본다. */
async function backfillCharacter(character: { id: string; ocid: string }, key: string, days: string[], result: Result) {
  const done = new Set((await prisma.bossSnapshot.findMany({ where: { characterId: character.id, date: { in: days } }, select: { date: true } })).map(row => row.date));
  for (const date of days.filter(day => !done.has(day))) {
    try {
      const end = Date.parse(`${date}T23:59:59+09:00`);
      const state = readSchedulerState(await nexonGet(`/scheduler/character-state?ocid=${encodeURIComponent(character.ocid)}&date=${date}`, key), end);
      await recordApiClears(character.id, state, end);
      await prisma.bossSnapshot.create({ data: { characterId: character.id, date, state } });
      result.filled += 1;
    } catch (error) {
      if (!(error instanceof NexonError)) throw error;
      // 결산 중(00009)이거나 조회 범위 밖(00004)이면 이 날짜만 다음에. 캐릭터를 못 찾으면(00003) 이 캐릭터는 다음에.
      if (error.code === "OPENAPI00009" || error.code === "OPENAPI00004") { result.pending += 1; continue; }
      if (error.code === "OPENAPI00003") { result.pending += 1; return; }
      throw error;
    }
  }
}

/** 등록된 모든 캐릭터의 지난 주·달 처치를 채운다. 넥슨 키가 없으면 아무것도 하지 않는다. */
export async function backfillBosses(now = Date.now()): Promise<Result> {
  const result: Result = { filled: 0, pending: 0 };
  const key = apiKey(); if (!key) return result;
  const days = closingDays(now);
  const characters = await prisma.character.findMany({ where: { ocid: { not: null } }, select: { id: true, ocid: true } });
  for (const character of characters) await backfillCharacter({ id: character.id, ocid: character.ocid! }, key, days, result);
  return result;
}

const state = globalThis as unknown as { bossBackfill?: NodeJS.Timeout };
/** 서버가 켜질 때 한 번(30초 뒤), 그 뒤 1시간마다 백필한다. 서버 로그에 채운 건수와 오류만 남긴다. */
export function startBossBackfill() {
  if (state.bossBackfill || !apiKey()) return;
  const run = () => backfillBosses().then(result => {
    if (result.filled) console.log(`[보스 기록] 지난 주·달 넥슨 조회 ${result.filled}건으로 처치 기록을 채웠습니다.${result.pending ? ` (아직 준비 안 됨 ${result.pending}건은 다음에)` : ""}`);
  }).catch(error => console.error(`[보스 기록] 지난 주·달 처치를 채우지 못했습니다: ${error instanceof Error ? error.message : error}`));
  setTimeout(run, 30_000).unref();
  state.bossBackfill = setInterval(run, HOUR);
  state.bossBackfill.unref();
}
