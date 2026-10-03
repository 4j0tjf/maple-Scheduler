"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { koreaDay } from "@/services/domain";
import { api, ApiError, errorText, type CharacterView } from "@/services/client";
import { monthStart, weekStart } from "@/services/period";
import { daysBetween, emptyBucket, hourly, summarize, total, add, type Bucket, type Grain, type ProfitRecord } from "@/services/profit";
import CharacterAvatar from "./CharacterAvatar";
import { button, card, eok, hoursText, number, smallField } from "./ui";

type Data = { characters: Pick<CharacterView, "id" | "name" | "level" | "image" | "className">[]; records: ProfitRecord[]; truncated: boolean };
const RANGES = [["7", "최근 7일"], ["30", "최근 30일"], ["90", "최근 90일"], ["all", "전체"]] as const;
type Range = (typeof RANGES)[number][0];
const GRAINS: [Grain, string][] = [["day", "일별"], ["week", "주별"], ["month", "월별"]];
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 24 * 3600_000;
function label(key: string, grain: Grain) {
  if (grain === "month") return `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;
  const date = new Date(`${key}T00:00:00Z`); const text = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  return grain === "week" ? `${text}(목) 주` : `${text} (${WEEKDAY[date.getUTCDay()]})`;
}
/** 눈금 값. 0부터 최댓값을 덮는 깔끔한 단위(1·2·5 × 10ⁿ)로 4칸 안팎. */
function ticks(max: number) {
  if (max <= 0) return [0];
  const raw = max / 4; const power = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 5, 10].map(n => n * power).find(n => n >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step);
}

/** 날짜별 수익 막대(메소 아래 · 조각 환산 위). 막대에 올리거나 포커스하면 그날 값을 보여준다. */
function ProfitChart({ buckets, grain }: { buckets: Bucket[]; grain: Grain }) {
  const [hover, setHover] = useState<number | null>(null); const [room, setRoom] = useState(0); const box = useRef<HTMLDivElement>(null);
  // 카드 폭에 맞춰 막대 칸을 넓힌다. 칸이 너무 좁아지면(긴 기간) 가로로 스크롤한다.
  useEffect(() => {
    const element = box.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => setRoom(Math.floor(entry.contentRect.width)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const ordered = [...buckets].reverse();
  const top = Math.max(0, ...ordered.map(bucket => bucket.meso + bucket.fragmentValue));
  const scale = ticks(top); const max = scale.at(-1) || 1;
  const height = 200; const slot = Math.max(10, room ? Math.min(64, room / Math.max(1, ordered.length)) : 18); const bar = Math.min(24, Math.max(4, slot * 0.6));
  const width = Math.max(ordered.length * slot, 200);
  const y = (value: number) => height - value / max * height;
  const shown = hover != null ? ordered[hover] : null;
  return <figure className="min-w-0">
    <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[2px] bg-chart-meso" />획득 메소</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[2px] bg-chart-fragment" />조각 환산</span>
      <span aria-live="polite" className="ml-auto min-h-4 text-ink">{shown ? <><b className="tabular-nums">{eok(shown.meso + shown.fragmentValue)}</b> · {label(shown.key, grain)} · 메소 {eok(shown.meso)} · 조각 {eok(shown.fragmentValue)} · {shown.hunts}회</> : "막대에 올리면 값을 보여줍니다"}</span>
    </div>
    <div className="mt-4 flex gap-2">
      <div className="relative w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-faint" style={{ height }} aria-hidden>
        {scale.map(value => <span key={value} className="absolute right-0 -translate-y-1/2" style={{ top: y(value) }}>{value ? eok(value) : "0"}</span>)}
      </div>
      <div ref={box} className="min-w-0 flex-1 overflow-x-auto pb-1">
        <svg role="img" aria-label="기간별 사냥 수익 막대 그래프. 같은 값은 아래 표에 있습니다." width={width} height={height + 22} className="block" onPointerLeave={() => setHover(null)}>
          {scale.map(value => <line key={value} x1={0} x2={width} y1={y(value)} y2={y(value)} stroke="var(--line)" strokeWidth={1} />)}
          {ordered.map((bucket, index) => {
            const x = index * slot + (slot - bar) / 2; const mesoTop = y(bucket.meso); const fragTop = y(bucket.meso + bucket.fragmentValue);
            const gap = bucket.meso > 0 && bucket.fragmentValue > 0 ? 2 : 0;
            const r = Math.min(4, bar / 2);
            // 위쪽 끝만 둥글게(바닥은 각지게). 위에 있는 조각 환산이 없으면 메소 막대가 끝을 맡는다.
            const segment = (top: number, bottom: number, round: boolean) => bottom - top < 0.5 ? null : round
              ? `M${x},${bottom} V${top + Math.min(r, (bottom - top))} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + Math.min(r, bottom - top)} V${bottom} Z`
              : `M${x},${bottom} V${top} H${x + bar} V${bottom} Z`;
            const meso = segment(mesoTop, height, bucket.fragmentValue <= 0);
            const fragment = segment(fragTop, mesoTop - gap, true);
            const showLabel = grain !== "day" || ordered.length <= 14 || index % Math.ceil(ordered.length / 10) === 0 || index === ordered.length - 1;
            return <g key={bucket.key} tabIndex={0} role="img" aria-label={`${label(bucket.key, grain)} 수익 ${eok(bucket.meso + bucket.fragmentValue)}, 메소 ${eok(bucket.meso)}, 조각 환산 ${eok(bucket.fragmentValue)}, ${bucket.hunts}회`}
              onPointerEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} className="outline-none">
              <rect x={index * slot} y={0} width={slot} height={height} fill={hover === index ? "var(--surface-3)" : "transparent"} opacity={0.6} />
              {meso && <path d={meso} fill="var(--chart-meso)" />}
              {fragment && <path d={fragment} fill="var(--chart-fragment)" />}
              {showLabel && <text x={index * slot + slot / 2} y={height + 15} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
                {grain === "month" ? `${Number(bucket.key.slice(5, 7))}월` : `${Number(bucket.key.slice(5, 7))}/${Number(bucket.key.slice(8, 10))}`}</text>}
            </g>;
          })}
        </svg>
      </div>
    </div>
  </figure>;
}

/**
 * 사냥 수익 탭. 사냥 기록 탭에서 저장한 기록을 계정 전체(또는 캐릭터 하나)로 모아 일·주·월 수익을 보여준다.
 * 직접 입력하는 값은 없다. 기록을 고치면(보정·시세 입력·삭제) 여기도 따라 바뀐다.
 */
export default function ProfitPanel({ active, onUnauthorized }: { active: boolean; onUnauthorized: () => void }) {
  const [data, setData] = useState<Data | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [character, setCharacter] = useState("all"); const [range, setRange] = useState<Range>("30"); const [grain, setGrain] = useState<Grain>("day");
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<Data>("/api/hunts")); setNow(Date.now()); }
    catch (failure) { if (failure instanceof ApiError && failure.status === 401) onUnauthorized(); else setError(errorText(failure, "사냥 기록을 불러오지 못했습니다.")); }
    finally { setLoading(false); }
  }, [onUnauthorized]);
  // 탭을 열 때마다 새로 받는다(사냥 기록 탭에서 방금 저장한 기록까지 반영).
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer);
  }, [active, load]);

  const today = koreaDay(now);
  const mine = (data?.records ?? []).filter(record => character === "all" || record.characterId === character);
  const from = range === "all" ? null : koreaDay(now - (Number(range) - 1) * DAY);
  const inRange = mine.filter(record => !from || record.day >= from);
  const buckets = summarize(inRange, grain);
  const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
  // 일별 그래프는 사냥하지 않은 날도 0으로 채워 날짜 간격을 지킨다.
  const chart = grain !== "day" || !inRange.length ? buckets
    : daysBetween(from ?? inRange.reduce((min, record) => record.day < min ? record.day : min, today), today).map(day => byKey.get(day) ?? emptyBucket(day)).reverse();
  const sum = (filter: (record: ProfitRecord) => boolean) => mine.filter(filter).reduce(add, emptyBucket("sum"));
  const tiles: [string, Bucket][] = [["오늘", sum(record => record.day === today)], ["이번 주 (목~)", sum(record => record.day >= weekStart(now))],
    ["이번 달", sum(record => record.day >= monthStart(now))], [RANGES.find(([key]) => key === range)![1], total(inRange)]];
  const byCharacter = (data?.characters ?? []).map(row => ({ row, bucket: inRange.filter(record => record.characterId === row.id).reduce(add, emptyBucket(row.id)) }))
    .filter(item => item.bucket.hunts).sort((a, b) => b.bucket.profit - a.bucket.profit);
  const rangeTotal = total(inRange); const unpriced = rangeTotal.unpriced;

  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">사냥 <span className="text-accent">수익</span></h1>
        <p className="mt-1 text-sm text-ink-muted">사냥 기록에서 자동으로 계산합니다 · 수익 = 획득 메소 + 조각 환산(그날 경매장 평균가)</p>
      </div>
      <button className={button} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>
    </header>

    {/* 필터는 한 줄로, 아래의 숫자·그래프·표가 모두 같은 범위를 쓴다. */}
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="캐릭터" className={`${smallField} w-44`} value={character} onChange={event => setCharacter(event.target.value)}>
        <option value="all">전체 캐릭터</option>
        {(data?.characters ?? []).map(row => <option key={row.id} value={row.id}>{row.name}{row.level != null ? ` · Lv.${row.level}` : ""}</option>)}
      </select>
      <div role="radiogroup" aria-label="기간" className="flex rounded-xl border border-line bg-surface-1 p-1 text-sm font-semibold">
        {RANGES.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={range === key} onClick={() => setRange(key)}
          className={`rounded-lg px-3 py-1 ${range === key ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink"}`}>{text}</button>)}
      </div>
      <div role="radiogroup" aria-label="묶음" className="flex rounded-xl border border-line bg-surface-1 p-1 text-sm font-semibold">
        {GRAINS.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={grain === key} onClick={() => setGrain(key)}
          className={`rounded-lg px-3 py-1 ${grain === key ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}>{text}</button>)}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-warning">{error}</p>}

    <dl className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${loading && data ? "opacity-60" : ""}`}>
      {tiles.map(([title, bucket], index) => { const rate = hourly(bucket); return <div key={title} className={`rounded-2xl border px-4 py-3 shadow-card ${index === 3 ? "border-accent/40 bg-accent/5" : "border-line bg-surface-1"}`}>
        <dt className="text-xs text-ink-muted">{title}</dt>
        <dd className={`mt-1 text-xl font-bold ${index === 3 ? "text-accent" : ""}`}>{bucket.counted ? eok(bucket.profit) : "—"}</dd>
        <dd className="text-xs tabular-nums text-ink-faint">{bucket.hunts ? `${bucket.hunts}회 · ${hoursText(bucket.ms)}${rate != null ? ` · 시간당 ${eok(rate)}` : ""}` : "사냥 없음"}</dd>
      </div>; })}
    </dl>

    {!data ? <section className={`${card} text-center text-sm text-ink-muted`}>{loading ? "사냥 기록을 불러오는 중…" : "사냥 기록을 불러오지 못했습니다."}</section>
      : !inRange.length ? <section className={`${card} text-center`}>
        <h2 className="text-base font-bold tracking-tight">이 기간에 사냥 기록이 없습니다</h2>
        <p className="mt-2 text-sm text-ink-muted">사냥 기록 탭에서 재획을 기록하면 여기에 수익이 자동으로 쌓입니다. 예전 사냥 기록은 사냥 기록 탭의 ‘기존 사냥 기록 가져오기’로 옮길 수 있습니다.</p>
      </section> : <>
      <section className={`${card} ${loading ? "opacity-60" : ""}`} aria-labelledby="profit-chart">
        <h2 id="profit-chart" className="mb-3 text-base font-bold tracking-tight">{GRAINS.find(([key]) => key === grain)![1]} <span className="text-accent">수익</span></h2>
        <ProfitChart buckets={chart} grain={grain} />
        {unpriced > 0 && <p className="mt-2 text-xs text-ink-faint">조각 시세가 없는 기록 {unpriced}건은 조각 환산 없이 메소만 더했습니다(사냥 기록 탭의 ‘보정’에서 그날 시세를 넣을 수 있습니다).</p>}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className={card} aria-labelledby="profit-table">
          <h2 id="profit-table" className="mb-3 text-base font-bold tracking-tight">기간별 <span className="text-accent">합계</span></h2>
          <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-sm">
            <thead className="border-b border-line text-xs text-ink-muted"><tr>
              {["기간", "사냥", "사냥 시간", "획득 메소", "획득 조각", "조각 환산", "합계 수익", "시간당"].map((head, index) => <th key={head} scope="col" className={`px-3 py-2 font-semibold ${index === 0 ? "text-left" : ""}`}>{head}</th>)}
            </tr></thead>
            <tbody>{buckets.map(bucket => { const rate = hourly(bucket); return <tr key={bucket.key} className="border-b border-line/60">
              <th scope="row" className="px-3 py-2.5 text-left font-medium">{label(bucket.key, grain)}</th>
              <td className="px-3 py-2.5 tabular-nums">{bucket.hunts}회</td>
              <td className="px-3 py-2.5 tabular-nums">{hoursText(bucket.ms)}</td>
              <td className="px-3 py-2.5 tabular-nums">{eok(bucket.meso)}</td>
              <td className="px-3 py-2.5 tabular-nums">{number(bucket.fragments)}개</td>
              <td className="px-3 py-2.5 tabular-nums">{eok(bucket.fragmentValue)}</td>
              <td className="px-3 py-2.5 font-semibold tabular-nums text-accent">{bucket.counted ? eok(bucket.profit) : "—"}</td>
              <td className="px-3 py-2.5 tabular-nums text-ink-muted">{rate != null ? eok(rate) : "—"}</td>
            </tr>; })}</tbody>
            <tfoot><tr className="font-semibold">
              <th scope="row" className="px-3 py-2.5 text-left">합계</th>
              <td className="px-3 py-2.5 tabular-nums">{rangeTotal.hunts}회</td><td className="px-3 py-2.5 tabular-nums">{hoursText(rangeTotal.ms)}</td>
              <td className="px-3 py-2.5 tabular-nums">{eok(rangeTotal.meso)}</td><td className="px-3 py-2.5 tabular-nums">{number(rangeTotal.fragments)}개</td>
              <td className="px-3 py-2.5 tabular-nums">{eok(rangeTotal.fragmentValue)}</td><td className="px-3 py-2.5 tabular-nums text-accent">{eok(rangeTotal.profit)}</td>
              <td className="px-3 py-2.5 tabular-nums text-ink-muted">{hourly(rangeTotal) != null ? eok(hourly(rangeTotal)!) : "—"}</td>
            </tr></tfoot>
          </table></div>
          {data.truncated && <p className="mt-2 text-xs text-ink-faint">최근 기록 5,000건까지만 계산했습니다.</p>}
        </section>

        <section className={card} aria-labelledby="profit-characters">
          <h2 id="profit-characters" className="mb-3 text-base font-bold tracking-tight">캐릭터별 <span className="text-accent">수익</span></h2>
          <ul className="space-y-3">{byCharacter.map(({ row, bucket }) => <li key={row.id} className="flex items-center gap-3">
            <CharacterAvatar name={row.name} image={row.image} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-semibold">{row.name}</span><span className="font-semibold tabular-nums">{eok(bucket.profit)}</span></p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-chart-meso" style={{ width: `${rangeTotal.profit > 0 ? Math.max(2, bucket.profit / rangeTotal.profit * 100) : 0}%` }} /></div>
              <p className="mt-0.5 text-xs tabular-nums text-ink-faint">{bucket.hunts}회 · {hoursText(bucket.ms)}{hourly(bucket) != null ? ` · 시간당 ${eok(hourly(bucket)!)}` : ""}</p>
            </div>
          </li>)}</ul>
        </section>
      </div>
    </>}
  </div>;
}
