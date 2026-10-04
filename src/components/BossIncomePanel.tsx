"use client";

import { useCallback, useEffect, useState } from "react";
import { BOSSES, WEEKLY_BOSS_LIMIT } from "@/data/bosses";
import { incomeByMonth, type IncomeRow } from "@/services/boss-income";
import { api, ApiError, errorText, type CharacterView } from "@/services/client";
import { weekLabel } from "@/services/period";
import { button, card, eok, number, smallField } from "./ui";

type Data = { now: number; characters: Pick<CharacterView, "id" | "name" | "level" | "image">[]; income: IncomeRow[] };
const MONTHLY = BOSSES.filter(boss => boss.cycle === "monthly").map(boss => boss.name).join("·");
const monthTitle = (month: string) => `${Number(month.slice(5, 7))}월`;

/**
 * 보스 수익 탭. 주간 보스 탭에 쌓인 처치 기록으로 주(목~수)별 결정석 수익과 달 합계를 보여준다. 직접 입력하는 값은 없다.
 * 주는 시작일(목요일)이 속한 달에 넣고, 월간 보스(검은 마법사)는 그 달에 따로 더한다.
 */
export default function BossIncomePanel({ active, onUnauthorized }: { active: boolean; onUnauthorized: () => void }) {
  const [data, setData] = useState<Data | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [character, setCharacter] = useState("all");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<Data>("/api/boss-income")); }
    catch (failure) { if (failure instanceof ApiError && failure.status === 401) onUnauthorized(); else setError(errorText(failure, "보스 수익을 불러오지 못했습니다.")); }
    finally { setLoading(false); }
  }, [onUnauthorized]);
  // 탭을 열 때마다 새로 받는다(주간 보스 탭에서 방금 체크한 처치까지 반영).
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer);
  }, [active, load]);

  const rows = (data?.income ?? []).filter(row => character === "all" || row.characterId === character);
  const months = data ? incomeByMonth(rows, data.now) : [];
  const week = months.flatMap(month => month.weeks).find(item => item.current);
  const tiles: [string, number, string][] = [
    ["이번 주", week?.amount ?? 0, week ? weekLabel(week.start) : ""],
    ["이번 달", months[0]?.total ?? 0, months[0] ? `${monthTitle(months[0].month)} 시작 주 + 월간 보스` : ""],
    ["지난 달", months[1]?.total ?? 0, months[1] ? monthTitle(months[1].month) : "기록 없음"],
    ["누적", months.reduce((sum, month) => sum + month.total, 0), "기록된 모든 처치"],
  ];

  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">보스 <span className="text-accent">수익</span></h1>
        <p className="mt-1 text-sm text-ink-muted">주간 보스 탭의 처치 기록으로 계산합니다 · 수익 = 처치할 때의 결정석 판매가 ÷ 인원(1인 몫)</p>
      </div>
      <button className={button} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>
    </header>

    <select aria-label="캐릭터" className={`${smallField} w-44`} value={character} onChange={event => setCharacter(event.target.value)}>
      <option value="all">전체 캐릭터</option>
      {(data?.characters ?? []).map(row => <option key={row.id} value={row.id}>{row.name}{row.level != null ? ` · Lv.${row.level}` : ""}</option>)}
    </select>
    {error && <p role="alert" className="text-sm text-warning">{error}</p>}

    <dl className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${loading && data ? "opacity-60" : ""}`}>
      {tiles.map(([title, amount, note], index) => <div key={title} className={`rounded-2xl border px-4 py-3 shadow-card ${index === 1 ? "border-accent/40 bg-accent/5" : "border-line bg-surface-1"}`}>
        <dt className="text-xs text-ink-muted">{title}</dt>
        <dd className={`mt-1 text-xl font-bold tabular-nums ${index === 1 ? "text-accent" : ""}`} title={`${number(amount)} 메소`}>{data ? eok(amount) : "—"}</dd>
        <dd className="truncate text-xs text-ink-faint">{note}</dd>
      </div>)}
    </dl>

    {!data ? <section className={`${card} text-center text-sm text-ink-muted`}>{loading ? "보스 수익을 불러오는 중…" : "보스 수익을 불러오지 못했습니다."}</section>
      : !rows.length ? <section className={`${card} text-center`}>
        <h2 className="text-base font-bold tracking-tight">아직 처치 기록이 없습니다</h2>
        <p className="mt-2 text-sm text-ink-muted">주간 보스 탭에서 넥슨 스케줄러가 완료로 알려 준 처치와 직접 체크한 처치가 주마다 여기에 쌓입니다.</p>
      </section> : months.map(month => <section key={month.month} className={`${card} ${loading ? "opacity-60" : ""}`} aria-labelledby={`income-${month.month}`}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`income-${month.month}`} className="text-base font-bold tracking-tight">{month.month.slice(0, 4)}년 <span className="text-accent">{monthTitle(month.month)}</span></h2>
          <p className="text-sm text-ink-muted">총 수익 <b className="ml-1 text-lg tabular-nums text-accent" title={`${number(month.total)} 메소`}>{eok(month.total)}</b></p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs text-ink-muted"><tr>
            <th scope="col" className="py-2 pr-3 text-left font-semibold">기간 (목 ~ 수)</th>
            <th scope="col" className="w-14 px-2 py-2 text-right font-semibold sm:w-20 sm:px-3">처치</th>
            <th scope="col" className="w-28 py-2 pl-2 text-right font-semibold sm:w-32 sm:pl-3">수익</th>
          </tr></thead>
          <tbody>
            {month.weeks.map(item => <tr key={item.start} className="border-b border-line/60">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                <span className="whitespace-nowrap tabular-nums">{weekLabel(item.start)}</span>
                {item.current && <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">이번 주</span>}
                {item.dropped > 0 && <span className="ml-2 inline-block text-xs font-normal text-ink-faint">{WEEKLY_BOSS_LIMIT}마리 초과 {item.dropped}마리 제외</span>}
              </th>
              <td className="px-2 py-2.5 text-right tabular-nums text-ink-muted sm:px-3">{item.count ? `${item.count}마리` : "—"}</td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right font-semibold tabular-nums sm:pl-3" title={`${number(item.amount)} 메소`}>{item.count ? eok(item.amount) : "—"}</td>
            </tr>)}
            {month.monthly.count > 0 && <tr className="border-b border-line/60">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium">월간 보스 <span className="inline-block whitespace-nowrap text-xs font-normal text-ink-faint">{MONTHLY}</span></th>
              <td className="px-2 py-2.5 text-right tabular-nums text-ink-muted sm:px-3">{month.monthly.count}회</td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right font-semibold tabular-nums sm:pl-3" title={`${number(month.monthly.amount)} 메소`}>{eok(month.monthly.amount)}</td>
            </tr>}
          </tbody>
          <tfoot><tr>
            <th scope="row" colSpan={2} className="pt-3 pr-3 text-left font-bold">{monthTitle(month.month)} 총 수익</th>
            <td className="pt-3 pl-3 text-right text-base font-bold tabular-nums text-accent" title={`${number(month.total)} 메소`}>{eok(month.total)}</td>
          </tr></tfoot>
        </table>
      </section>)}

    <p className="text-xs leading-relaxed text-ink-faint">
      주는 시작일(목요일)이 속한 달에 넣습니다(예: 10/29~11/4 주는 10월). 주간 보스는 캐릭터마다 한 주에 {WEEKLY_BOSS_LIMIT}마리까지만 결정석을 팔 수 있어 몫이 큰 {WEEKLY_BOSS_LIMIT}마리만 셉니다.
      넥슨 처치는 주간 보스 탭을 열 때 받아 저장하므로, 초기화(목요일 0시) 전에 주간 보스 탭을 한 번 열어 두어야 그 주 처치가 빠지지 않습니다.
    </p>
  </div>;
}
