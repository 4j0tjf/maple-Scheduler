import { BOSSES, bossKeyOfName, findBoss, isDifficulty, levelOf, maxPartyOf, shareOf, WEEKLY_BOSS_LIMIT, type Boss, type Cycle, type Difficulty } from "@/data/bosses";
import { periodOf } from "./period";

/**
 * 넥슨 스케줄러 응답(scheduler/character-state)의 보스 부분과, 그것으로 만든 캐릭터별 보스 목록.
 * 서버(동기화·처치 저장)와 화면(목록·합계)이 같이 쓴다.
 */
export type ApiBoss = { boss: string | null; name: string; difficulty: string; cycle: Cycle; registered: boolean; complete: boolean };
export type BossState = {
  /** 응답을 받은 시각. 완료 여부는 이 시각이 속한 주기(주·달)의 것이다. */
  fetchedAt: number;
  bosses: ApiBoss[];
  weeklyCount: number | null; weeklyLimit: number | null;
  /** 주간 보스 항목이 하나도 없으면 미접속 등으로 줄어든 응답이다. 이때 등록·완료 여부를 믿지 않는다. */
  weeklyStale: boolean;
};

type Wire = { boss_contents?: unknown; weekly_boss_clear_count?: unknown; weekly_boss_clear_limit_count?: unknown };
/** 넥슨 응답 → BossState. 일간 보스(bossDaily)는 버린다. 플래그는 문자열 "true"/"false"로 온다. */
export function readSchedulerState(data: Wire, fetchedAt: number): BossState {
  const list = Array.isArray(data.boss_contents) ? data.boss_contents as Record<string, unknown>[] : [];
  const bosses: ApiBoss[] = [];
  for (const item of list) {
    const cycle = item?.cycle === "bossWeekly" ? "weekly" : item?.cycle === "bossMonthly" ? "monthly" : null;
    if (!cycle || typeof item.content_name !== "string") continue;
    const boss = bossKeyOfName(item.content_name);
    bosses.push({ boss, name: item.content_name, difficulty: String(item.difficulty ?? ""), cycle: findBoss(boss)?.cycle === "season" ? "season" : cycle,
      registered: item.registration_flag === "true" || item.registration_flag === true,
      complete: item.complete_flag === "true" || item.complete_flag === true });
  }
  const count = (value: unknown) => Number.isInteger(value) ? value as number : null;
  return { fetchedAt, bosses, weeklyCount: count(data.weekly_boss_clear_count), weeklyLimit: count(data.weekly_boss_clear_limit_count),
    weeklyStale: !list.some(item => item?.cycle === "bossWeekly") };
}

export type BossSettingView = { difficulty: string | null; partySize: number; added: boolean };
export type BossClearView = { period: string; difficulty: string; partySize: number; price: number; source: "api" | "manual" };
export type BossRow = {
  boss: Boss; difficulty: Difficulty; partySize: number; maxParty: number;
  /** 1인 판매가와 파티원 1인 몫(가격 ÷ 인원, 버림). */
  price: number; share: number;
  /** 게임 스케줄러에 등록됨 · 직접 추가함 · 이번 주기에 처치함. */
  registered: boolean; added: boolean; cleared: boolean; clearSource: "api" | "manual" | null;
  /** 12마리 제한 밖(주간 보스 중 몫이 작은 쪽). 예상 수익에 넣지 않는다. */
  overLimit: boolean;
  period: string;
};

/** 그 주기의 API 완료·등록 정보. 지난 주기에 받은 응답의 완료 표시는 쓰지 않는다. */
export function apiFor(state: BossState | null, boss: Boss, now: number) {
  if (!state || state.weeklyStale) return { registered: undefined, complete: undefined };
  const same = periodOf(boss.cycle, state.fetchedAt) === periodOf(boss.cycle, now);
  const entries = state.bosses.filter(entry => entry.boss === boss.key && isDifficulty(entry.difficulty));
  const priced = (list: ApiBoss[]) => list.sort((a, b) => (levelOf(boss, b.difficulty)?.price ?? 0) - (levelOf(boss, a.difficulty)?.price ?? 0))[0];
  return { registered: priced(entries.filter(entry => entry.registered)), complete: same ? priced(entries.filter(entry => entry.complete)) : undefined };
}

/**
 * 캐릭터의 보스 목록. 게임 스케줄러에 등록한 보스, 이번 주기에 처치한 보스, 직접 추가한 보스를 모은다.
 * 난이도는 처치한 난이도 → 직접 고른 난이도 → 게임에 등록한 난이도 순서로 정한다.
 */
export function bossRows(state: BossState | null, settings: Record<string, BossSettingView>, clears: Record<string, BossClearView>, now: number): BossRow[] {
  const rows: BossRow[] = [];
  for (const boss of BOSSES) {
    const period = periodOf(boss.cycle, now);
    const api = apiFor(state, boss, now);
    const setting = settings[boss.key]; const clear = clears[boss.key]?.period === period ? clears[boss.key] : undefined;
    if (!api.registered && !api.complete && !setting?.added && !clear) continue;
    const pick = [clear?.difficulty, api.complete?.difficulty, setting?.difficulty, api.registered?.difficulty].find(value => isDifficulty(value) && levelOf(boss, value));
    if (!pick) continue;
    const difficulty = pick as Difficulty;
    const maxParty = maxPartyOf(boss, difficulty);
    const partySize = Math.min(maxParty, Math.max(1, clear?.partySize ?? setting?.partySize ?? 1));
    // 처치한 주기에는 처치할 때의 가격을 쓴다. 가격 패치가 있어도 그 주의 수익은 바뀌지 않는다.
    const price = clear?.price ?? levelOf(boss, difficulty)!.price;
    rows.push({ boss, difficulty, partySize, maxParty, price, share: shareOf(price, partySize),
      registered: !!api.registered, added: !!setting?.added, cleared: !!clear || !!api.complete,
      clearSource: clear?.source ?? (api.complete ? "api" : null), overLimit: false, period });
  }
  // 화면 순서는 BOSSES(저장한 보스 목록 HTML 순서)를 유지하고, 수익에 넣을 보스만 몫 순으로 고른다.
  const limit = state?.weeklyLimit || WEEKLY_BOSS_LIMIT;
  // 처치한 보스를 먼저 세고, 남은 자리는 몫이 큰 보스부터 채운다.
  const weekly = rows.filter(row => row.boss.cycle === "weekly").sort((a, b) => b.share - a.share || a.boss.level - b.boss.level);
  const counted = new Set([...weekly.filter(row => row.cleared), ...weekly.filter(row => !row.cleared)].slice(0, limit));
  for (const row of weekly) row.overLimit = !counted.has(row);
  return rows;
}

export type BossTotals = { weekly: { cleared: number; planned: number; count: number; clearedCount: number }; monthly: { cleared: number; planned: number } };
/** 이번 주(시즌 보스 포함)와 이번 달(월간 보스) 결정석 수익. planned는 목록을 모두 잡았을 때다. */
export function bossTotals(rows: BossRow[]): BossTotals {
  const totals: BossTotals = { weekly: { cleared: 0, planned: 0, count: 0, clearedCount: 0 }, monthly: { cleared: 0, planned: 0 } };
  for (const row of rows) {
    const bucket = row.boss.cycle === "monthly" ? totals.monthly : totals.weekly;
    if (row.cleared) bucket.cleared += row.share;
    if (!row.overLimit) bucket.planned += row.share;
    if (row.boss.cycle === "weekly") { totals.weekly.count += row.overLimit ? 0 : 1; totals.weekly.clearedCount += row.cleared ? 1 : 0; }
  }
  return totals;
}
