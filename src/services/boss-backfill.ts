import "server-only";
import { prisma } from "@/lib/prisma";
import { readSchedulerState, type BossState } from "./boss-plan";
import { recordApiClears, settle } from "./character-sync";
import { keyRejected, NexonError, nexonError, nexonGet } from "./nexon";
import { isPeriodEnd, pastDays } from "./period";

/**
 * 사이트를 열지 않은 날의 보스 처치도 기록되게 하는 백필.
 * 넥슨 스케줄러는 date=YYYY-MM-DD로 어제부터 13일 전까지, 그날이 끝난 상태와 그날 접속했는지(일간 보스 항목 유무)를 돌려준다.
 * 날마다 한 번 받아 boss_snapshots에 남기고, 그 상태로 그 주기 처치를 기록한다. 접속 여부는 주기가 바뀐 뒤 넥슨이 보내는
 * 지난 주기 완료 표시를 가리는 데 쓴다(settle). 어제 것은 KST 00:00~02:00 무렵 결산 중(OPENAPI00009)이면 다음에 다시 부른다.
 */
const HOUR = 3600_000;

/** failed는 이번에 채우지 못한 계정(아이디)과 이유. 한 계정의 키가 틀려도 다른 계정은 계속 채운다. */
type Result = { filled: number; pending: number; failed: { account: string; reason: string }[] };
/** 캐릭터 한 명의 빠진 날짜를 받고, 새로 받은 날과 주기 마지막 날을 다시 판정해 처치 기록에 반영한다. */
async function backfillCharacter(character: { id: string; ocid: string; activeDay: string | null }, key: string, days: string[], result: Result) {
  const rows = await prisma.bossSnapshot.findMany({ where: { characterId: character.id, date: { in: days } }, select: { date: true, state: true } });
  const states = new Map(rows.map(row => [row.date, row.state as BossState]));
  // 접속 여부를 남기기 전에 받은 날짜(loggedIn 없음)는 다시 받는다.
  const added = new Set<string>();
  for (const date of days.filter(day => typeof states.get(day)?.loggedIn !== "boolean")) {
    try {
      const state = readSchedulerState(await nexonGet(`/scheduler/character-state?ocid=${encodeURIComponent(character.ocid)}&date=${date}`, key), Date.parse(`${date}T23:59:59+09:00`));
      await prisma.bossSnapshot.upsert({ where: { characterId_date: { characterId: character.id, date } }, create: { characterId: character.id, date, state }, update: { state, fetchedAt: new Date() } });
      states.set(date, state); added.add(date); result.filled += 1;
    } catch (error) {
      if (!(error instanceof NexonError)) throw error;
      // 결산 중(00009)이거나 조회 범위 밖(00004)이면 이 날짜만 다음에. 캐릭터를 못 찾으면(00003) 이 캐릭터는 다음에.
      if (error.code === "OPENAPI00009" || error.code === "OPENAPI00004") { result.pending += 1; continue; }
      if (error.code === "OPENAPI00003") { result.pending += 1; break; }
      throw error;
    }
  }
  if (!added.size) return;
  // 새로 받은 날, 그리고 접속 여부가 새로 밝혀졌을 수 있는 주기 마지막 날을 판정한다. 마지막 날까지 한 번도 접속하지 않은 주기는
  // 그 주기의 넥슨 처치 기록을 지운다(지난 주기 완료 표시를 잘못 센 것). 중간 날에는 그 뒤에 접속했을 수 있어 지우지 않는다.
  for (const date of days) {
    const state = states.get(date);
    if (!state || typeof state.loggedIn !== "boolean" || !(added.has(date) || isPeriodEnd("weekly", date) || isPeriodEnd("monthly", date))) continue;
    const settled = await settle(character.id, state, character.activeDay, null, group => isPeriodEnd(group, date));
    await recordApiClears(character.id, settled, state.fetchedAt);
  }
}

/**
 * 넥슨 API 키를 등록한 계정마다 그 키로 그 계정 캐릭터의 지난 날짜를 채운다. 키가 없는 계정은 건너뛴다.
 * 호출 한도는 키마다 따로라 계정끼리는 함께 돌리고, 한 계정 안에서는 캐릭터를 차례로 부른다.
 */
export async function backfillBosses(now = Date.now()): Promise<Result> {
  const result: Result = { filled: 0, pending: 0, failed: [] };
  const days = pastDays(now);
  const accounts = await prisma.account.findMany({ where: { nexonApiKey: { not: null }, characters: { some: { ocid: { not: null } } } },
    select: { username: true, nexonApiKey: true, characters: { where: { ocid: { not: null } }, select: { id: true, ocid: true, activeDay: true } } } });
  await Promise.all(accounts.map(async account => {
    try {
      for (const character of account.characters)
        await backfillCharacter({ id: character.id, ocid: character.ocid!, activeDay: character.activeDay }, account.nexonApiKey!, days, result);
    } catch (error) {
      const reason = error instanceof NexonError ? (keyRejected(error) ? "넥슨 API 키가 올바르지 않거나 권한이 없음" : nexonError(error.code)) : error instanceof Error ? error.message : String(error);
      result.failed.push({ account: account.username, reason });
    }
  }));
  return result;
}

const timer = globalThis as unknown as { bossBackfill?: NodeJS.Timeout };
/**
 * 서버가 켜질 때 한 번(30초 뒤), 그 뒤 1시간마다 백필한다. 서버 로그에 받은 건수와 오류만 남긴다.
 * 계정이 나중에 키를 등록할 수 있어 키가 있는 계정이 없어도 타이머는 켜 둔다(그때는 DB 조회 한 번으로 끝난다).
 */
export function startBossBackfill() {
  if (timer.bossBackfill) return;
  const run = () => backfillBosses().then(result => {
    if (result.filled) console.log(`[보스 기록] 지난 날짜 넥슨 조회 ${result.filled}건으로 처치 기록을 채웠습니다.${result.pending ? ` (아직 준비 안 됨 ${result.pending}건은 다음에)` : ""}`);
    for (const { account, reason } of result.failed) console.error(`[보스 기록] ${account} 계정의 지난 날짜 처치를 채우지 못했습니다: ${reason}`);
  }).catch(error => console.error(`[보스 기록] 지난 날짜 처치를 채우지 못했습니다: ${error instanceof Error ? error.message : error}`));
  setTimeout(run, 30_000).unref();
  timer.bossBackfill = setInterval(run, HOUR);
  timer.bossBackfill.unref();
}
