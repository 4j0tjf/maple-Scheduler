"use client";

import { useState } from "react";
import { BOSSES, CYCLE_LABEL, maxPartyOf, PRICE_BASIS, shareOf, topPrice, type Cycle } from "@/data/bosses";
import BossIcon from "./BossIcon";
import { DifficultyChip } from "./BossPanel";
import { card, eok, number } from "./ui";

const change = (price: number, previous: number | undefined) => {
  if (!previous || previous === price) return <span className="text-ink-faint">—</span>;
  const rate = (price - previous) / previous;
  return <span className={rate < 0 ? "text-info" : "text-danger"} title={`이전 ${number(previous)} 메소`}>{rate < 0 ? "▼" : "▲"} {Math.abs(rate * 100).toFixed(1)}%</span>;
};
const SECTIONS: { cycle: Cycle; title: string; note: string }[] = [
  { cycle: "weekly", title: "주간 보스", note: "매주 목요일 0시 초기화 · 캐릭터당 12마리까지 판매" },
  { cycle: "monthly", title: "월간 보스", note: "매월 1일 0시 초기화" },
  { cycle: "season", title: "시즌 보스", note: "주간 12마리 제한과 별도" },
];

/**
 * 주간보스 결정석 가격 탭. 보스·난이도별 1인 판매가와 파티 인원으로 나눈 몫을 보여준다.
 * 로그인하지 않아도 볼 수 있다.
 */
export default function CrystalPanel() {
  const [party, setParty] = useState(1); const [sort, setSort] = useState<"price" | "boss">("boss");
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">결정석 <span className="text-accent">가격</span></h1>
        <p className="mt-1 text-sm text-ink-muted">강렬한 힘의 결정 판매가 · {PRICE_BASIS}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="파티 인원" className="flex items-center gap-1 rounded-xl border border-line bg-surface-1 p-1 shadow-card">
          <span className="px-2 text-xs font-semibold text-ink-muted">인원</span>
          {[1, 2, 3, 4, 5, 6].map(size => <button key={size} type="button" role="radio" aria-checked={party === size} onClick={() => setParty(size)}
            className={`min-w-9 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${party === size ? "bg-accent text-accent-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}>{size}</button>)}
        </div>
        <div role="radiogroup" aria-label="정렬" className="flex rounded-xl border border-line bg-surface-1 p-1 text-sm font-semibold shadow-card">
          {([["boss", "보스순"], ["price", "가격순"]] as const).map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={sort === key} onClick={() => setSort(key)}
            className={`rounded-lg px-3 py-1 ${sort === key ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>)}
        </div>
      </div>
    </header>

    {SECTIONS.map(section => {
      const bosses = BOSSES.filter(boss => boss.cycle === section.cycle);
      const sorted = sort === "price" ? [...bosses].sort((a, b) => topPrice(b) - topPrice(a)) : bosses;
      return <section key={section.cycle} className={card} aria-labelledby={`crystal-${section.cycle}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`crystal-${section.cycle}`} className="text-base font-bold tracking-tight">{section.title} <span className="text-accent">{bosses.length}종</span></h2>
          <p className="text-xs text-ink-faint">{section.note}</p>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[600px] table-fixed whitespace-nowrap text-left text-sm">
          {/* 세 표(주간·월간·시즌)의 열이 같은 자리에 오도록 폭을 고정한다. */}
          <colgroup><col className="w-[34%]" /><col className="w-[14%]" /><col className="w-[18%]" /><col className="w-[20%]" /><col className="w-[14%]" /></colgroup>
          <thead className="border-b border-line text-xs text-ink-muted"><tr>
            <th scope="col" className="py-2 pr-3 font-semibold">보스</th><th scope="col" className="px-3 py-2 font-semibold">난이도</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">1인 판매가</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{party}인 파티 몫</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">9/17 대비</th>
          </tr></thead>
          <tbody>{sorted.map(boss => boss.levels.map((level, index) => {
            const max = maxPartyOf(boss, level.difficulty); const size = Math.min(party, max);
            return <tr key={`${boss.key}-${level.difficulty}`} className={index === boss.levels.length - 1 ? "border-b border-line" : ""}>
              {index === 0 && <th scope="rowgroup" rowSpan={boss.levels.length} className="py-2.5 pr-3 align-middle font-normal">
                <span className="flex items-center gap-2.5">
                  {/* 아이콘은 난이도 수와 관계없이 같은 크기로 둔다. 크기가 다르면 이름 시작 위치가 들쭉날쭉해진다. */}
                  <BossIcon boss={boss} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold" title={boss.name}>{boss.name}</span>
                    <span className="block text-xs tabular-nums text-ink-faint">Lv.{boss.level} · 최대 {boss.maxParty}인{boss.partyOverride ? "*" : ""}</span>
                    {boss.cycle !== "weekly" && <span className="mt-1 inline-block rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{CYCLE_LABEL[boss.cycle]}</span>}
                    {boss.note && <span className="mt-1 block whitespace-normal text-xs text-ink-faint">{boss.note}</span>}
                  </span>
                </span>
              </th>}
              <td className="px-3 py-2.5"><DifficultyChip difficulty={level.difficulty} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums" title={`${number(level.price)} 메소`}>{eok(level.price)}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-accent" title={`${number(shareOf(level.price, size))} 메소`}>
                {eok(shareOf(level.price, size))}{size < party && <span className="ml-1 text-[11px] font-normal text-ink-faint">({max}인)</span>}</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">{change(level.price, level.previous)}</td>
            </tr>;
          }))}</tbody>
        </table></div>
        {section.cycle === "weekly" && <p className="mt-3 text-xs text-ink-faint">* 익스트림 스우는 최대 2인. 파티 몫은 1인 판매가 ÷ 인원에서 소수점을 버린 값입니다. 9/17 대비는 2026-09-17 패치 전 가격과 비교한 변동입니다(검은 마법사는 2026-10-01 적용).</p>}
      </section>;
    })}
  </div>;
}
