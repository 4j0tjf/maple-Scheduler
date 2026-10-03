import type { Cycle } from "@/data/bosses";

/**
 * 보스 초기화 주기. 모두 한국 시간 기준이다.
 * 주간 보스는 매주 목요일 0시, 월간 보스(검은 마법사)는 매월 1일 0시에 초기화된다.
 * 주기는 그 주기의 첫날(한국 날짜 YYYY-MM-DD)로 부른다.
 */
const KST = 9 * 3600_000;
const DAY = 24 * 3600_000;
const day = (kstMs: number) => new Date(kstMs).toISOString().slice(0, 10);

/** 그 시각이 속한 주의 목요일(한국 날짜). */
export function weekStart(at: number) {
  const kst = at + KST; const midnight = kst - (((kst % DAY) + DAY) % DAY);
  // 1970-01-01은 목요일이라 경과 일수를 7로 나눈 나머지가 목요일부터 지난 날 수다.
  const sinceThursday = ((Math.floor(midnight / DAY) % 7) + 7) % 7;
  return day(midnight - sinceThursday * DAY);
}
/** 그 시각이 속한 달의 1일(한국 날짜). */
export const monthStart = (at: number) => `${day(at + KST).slice(0, 8)}01`;
export const periodOf = (cycle: Cycle, at: number) => cycle === "monthly" ? monthStart(at) : weekStart(at);
/** 다음 초기화 시각(UTC ms). */
export function nextReset(cycle: Cycle, at: number) {
  if (cycle === "monthly") {
    const [year, month] = monthStart(at).split("-").map(Number);
    return Date.UTC(year, month, 1) - KST;
  }
  return Date.parse(`${weekStart(at)}T00:00:00Z`) - KST + 7 * DAY;
}
/** 주간 보스 주기 표시용 "9/25(목) ~ 10/1(수)". */
export function weekLabel(start: string) {
  const from = Date.parse(`${start}T00:00:00Z`); const to = from + 6 * DAY;
  const text = (ms: number) => { const d = new Date(ms); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  return `${text(from)}(목) ~ ${text(to)}(수)`;
}
