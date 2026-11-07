import { koreaDate, pastDays } from "./period";
import type { BossState } from "./boss-plan";
import { NexonError } from "./nexon";

type History = { date: string; state: BossState };
type Source = NonNullable<BossState["registrationFallback"]>;
function remembered(state: BossState | null): Source | null {
  if (!state) return null;
  if (state.weeklyStale) return state.registrationFallback ?? null;
  return { fetchedAt: state.fetchedAt, bosses: state.bosses.filter(boss => boss.registered).map(boss => ({ ...boss, complete: false })) };
}
/** 목록만 복원한다. 과거 완료·처치 수·접속 여부는 현재 응답에 섞지 않는다. */
export async function recoverRegistrations(raw: BossState, saved: BossState | null, history: History[], lookup: (date: string) => Promise<BossState>, retry = false): Promise<BossState> {
  if (!raw.weeklyStale) return raw;
  const days = pastDays(raw.fetchedAt).reverse(); // 어제부터 13일 전까지, 가장 최신 기록 우선
  const sources = [remembered(saved), ...history.map(row => remembered(row.state))]
    .filter((source): source is Source => !!source && source.fetchedAt <= raw.fetchedAt)
    .sort((a, b) => b.fetchedAt - a.fetchedAt);
  if (sources[0]) return { ...raw, registrationFallback: sources[0] };
  const today = koreaDate(raw.fetchedAt);
  if (!retry && saved?.registrationCheckedDay === today) return { ...raw, registrationCheckedDay: today };
  const cached = new Map(history.map(row => [row.date, row.state]));
  for (const date of days) {
    try {
      const source = remembered(cached.get(date) ?? await lookup(date));
      if (source) return { ...raw, registrationFallback: source };
    } catch (error) {
      if (error instanceof NexonError && ["OPENAPI00004", "OPENAPI00009"].includes(error.code ?? "")) continue;
      if (error instanceof NexonError && error.code === "OPENAPI00003") break;
      // 키·접속·점검 오류는 목록을 지우지 않고 다음 동기화에서 재시도한다.
      return raw;
    }
  }
  return { ...raw, registrationCheckedDay: today };
}
