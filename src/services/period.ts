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

/** 그 시각의 한국 날짜(YYYY-MM-DD). */
export const koreaDate = (at: number) => day(at + KST);
/** 한국 날짜에 며칠을 더한다. */
export const addDays = (date: string, days: number) => day(Date.parse(`${date}T00:00:00Z`) + days * DAY);
/** 그 날짜가 주기의 마지막 날인지(주간: 수요일, 월간: 그 달 마지막 날). */
export function isPeriodEnd(cycle: Cycle, date: string) {
  const next = addDays(date, 1);
  return cycle === "monthly" ? next.endsWith("-01") : new Date(`${next}T00:00:00Z`).getUTCDay() === 4;
}

/** 넥슨 스케줄러를 지난 날짜로 조회할 수 있는 날 수. 어제부터 13일 전까지다(넥슨 한도 14일, 마지막 날은 주간 정산으로 몇 시간 일찍 닫힌다). */
export const PAST_QUERY_DAYS = 13;
/** 지난 날짜로 조회할 수 있는 날(한국 날짜, 오래된 순): 13일 전 ~ 어제. 그날이 끝난 상태와 그날 접속했는지를 준다. */
export function pastDays(at: number) {
  const today = koreaDate(at);
  return Array.from({ length: PAST_QUERY_DAYS }, (_, index) => addDays(today, index - PAST_QUERY_DAYS));
}
