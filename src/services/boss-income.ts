import { findBoss, shareOf, WEEKLY_BOSS_LIMIT } from "@/data/bosses";
import { monthStart, weekStart } from "./period";

/**
 * 보스 수익 종합. 저장된 처치 기록(boss_clears)을 주(목~수)·달로 묶는다. 서버(집계)와 화면(주간 보스 탭의 종합)이 같이 쓴다.
 * 수익은 파티원 1인 몫(처치할 때의 판매가 ÷ 인원, 버림)이다.
 */
export type ClearRecord = { characterId: string; period: string; boss: string; price: number; partySize: number };
/**
 * 캐릭터 한 명의 한 주기 수익. weekly는 그 주(목요일 period)의 주간 보스(12마리 제한 안)와 시즌 보스,
 * monthly는 그 달(1일 period)의 월간 보스다. dropped는 12마리를 넘겨 뺀 주간 보스 수.
 */
export type IncomeRow = { characterId: string; period: string; cycle: "weekly" | "monthly"; amount: number; count: number; dropped: number };

/** 캐릭터·주기별 수익. 주간 보스는 한 주에 12마리까지만 결정석을 팔 수 있으므로 몫이 큰 12마리만 센다. */
export function bossIncome(clears: ClearRecord[], limit = WEEKLY_BOSS_LIMIT): IncomeRow[] {
  const groups = new Map<string, { row: IncomeRow; weekly: number[] }>();
  for (const clear of clears) {
    const boss = findBoss(clear.boss); if (!boss) continue;
    const cycle = boss.cycle === "monthly" ? "monthly" : "weekly";
    const key = `${clear.characterId}|${clear.period}|${cycle}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = { row: { characterId: clear.characterId, period: clear.period, cycle, amount: 0, count: 0, dropped: 0 }, weekly: [] });
    const share = shareOf(clear.price, clear.partySize);
    if (boss.cycle === "weekly") group.weekly.push(share);
    else { group.row.amount += share; group.row.count += 1; }
  }
  return [...groups.values()].map(({ row, weekly }) => {
    const kept = weekly.sort((a, b) => b - a).slice(0, limit);
    return { ...row, amount: row.amount + kept.reduce((sum, share) => sum + share, 0), count: row.count + kept.length, dropped: weekly.length - kept.length };
  });
}

export type WeekIncome = { start: string; end: string; amount: number; current: boolean };
export type MonthIncome = { month: string; weeks: WeekIncome[]; monthly: number; total: number };

const DAY = 24 * 3600_000;
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const previousMonth = (month: string) => { const [year, number] = month.split("-").map(Number); return dateOf(Date.UTC(year, number - 2, 1)).slice(0, 7); };

/**
 * 달별 수익. 주는 시작일(목요일)이 속한 달에 넣는다(10/29~11/4 주는 10월). 그 달의 모든 주를 보이고(아직 오지 않은 주 포함) 기록이 없으면 0이다.
 * 처치 기록이 있는 가장 이른 달부터 이번 달까지, 최근 달이 앞에 온다.
 */
export function incomeByMonth(rows: IncomeRow[], now: number): MonthIncome[] {
  const thisWeek = weekStart(now); const thisMonth = monthStart(now).slice(0, 7);
  const weekly = new Map<string, number>(); const monthly = new Map<string, number>();
  for (const row of rows) {
    if (row.cycle === "monthly") monthly.set(row.period.slice(0, 7), (monthly.get(row.period.slice(0, 7)) ?? 0) + row.amount);
    else weekly.set(row.period, (weekly.get(row.period) ?? 0) + row.amount);
  }
  const first = [...rows.map(row => row.period.slice(0, 7)), thisMonth].sort()[0];
  const months: MonthIncome[] = [];
  for (let month = thisMonth; month >= first; month = previousMonth(month)) {
    const weeks: WeekIncome[] = [];
    const start = Date.parse(`${month}-01T00:00:00Z`);
    // 그 달의 첫 목요일(getUTCDay 4)부터 7일씩.
    for (let day = start + ((4 - new Date(start).getUTCDay() + 7) % 7) * DAY; dateOf(day).startsWith(month); day += 7 * DAY) {
      const key = dateOf(day);
      weeks.push({ start: key, end: dateOf(day + 6 * DAY), amount: weekly.get(key) ?? 0, current: key === thisWeek });
    }
    const boss = monthly.get(month) ?? 0;
    months.push({ month, weeks, monthly: boss, total: weeks.reduce((sum, week) => sum + week.amount, 0) + boss });
  }
  return months;
}
