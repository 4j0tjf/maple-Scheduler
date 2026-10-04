"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOSSES, CYCLE_LABEL, DIFFICULTY_LABEL, levelOf, maxPartyOf, WEEKLY_BOSS_LIMIT, type Boss, type Difficulty } from "@/data/bosses";
import { incomeByMonth, type IncomeRow, type MonthIncome } from "@/services/boss-income";
import { bossRows, bossTotals, hiddenBosses, type BossClearView, type BossRow, type BossSettingView, type BossState } from "@/services/boss-plan";
import { api, ApiError, errorText, type CharacterView } from "@/services/client";
import { monthStart, nextReset, weekLabel, weekStart } from "@/services/period";
import BossIcon from "./BossIcon";
import CharacterAvatar from "./CharacterAvatar";
import { button, card, eok, eokShort, field, number, primary, smallButton, smallField, smallPrimary } from "./ui";

type BossCharacter = { id: string; level: number | null; image: string | null; className: string | null; world: string | null;
  state: BossState | null; syncedAt: number | null; error: string | null; settings: Record<string, BossSettingView>; clears: Record<string, BossClearView> };
type BossData = { now: number; nexon: boolean; characters: BossCharacter[]; income: IncomeRow[] };
const TAB = "maple-scheduler-boss-tab-v1";
const DIFF_TONE: Record<Difficulty, string> = {
  easy: "bg-surface-3 text-ink-muted", normal: "bg-info/15 text-info", hard: "bg-danger/15 text-danger",
  chaos: "bg-[#7e22ce]/15 text-[#7e22ce] dark:text-[#d8b4fe]", extreme: "bg-warning/20 text-warning",
};
export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DIFF_TONE[difficulty]}`}>{DIFFICULTY_LABEL[difficulty]}</span>;
}
const left = (ms: number) => { const hours = Math.max(0, Math.floor(ms / 3600_000)); return hours >= 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간` : `${hours}시간 ${Math.floor(ms / 60_000) % 60}분`; };
const ago = (at: number | null, now: number) => {
  if (!at) return "아직 받지 않음";
  const minutes = Math.floor((now - at) / 60_000);
  return minutes < 1 ? "방금" : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : new Date(at).toLocaleDateString("ko-KR");
};

/** 캐릭터 등록. 넥슨 API로 캐릭터를 찾아 이미지·레벨을 함께 저장한다. */
function RegisterForm({ onDone, onCancel }: { onDone: (character: CharacterView, warning: string | null) => void; onCancel?: () => void }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { character, warning } = await api<{ character: CharacterView; warning: string | null }>("/api/characters", null, { method: "POST", body: JSON.stringify({ name }) });
      setName(""); onDone(character, warning);
    } catch (failure) { setError(errorText(failure, "등록하지 못했습니다.")); }
    finally { setBusy(false); }
  }
  return <form className="flex flex-wrap items-center gap-2" onSubmit={event => void submit(event)}>
    <input className={`${field} w-48`} aria-label="등록할 캐릭터명" placeholder="게임 캐릭터명" value={name} maxLength={12} required autoFocus onChange={event => setName(event.target.value)} />
    <button className={primary} disabled={busy}>{busy ? "넥슨에서 찾는 중…" : "등록"}</button>
    {onCancel && <button type="button" className={button} onClick={onCancel}>취소</button>}
    {error && <p role="alert" className="basis-full text-sm text-warning">{error}</p>}
  </form>;
}

/** 캐릭터 메모. 입력을 멈추면 0.8초 뒤 저장한다. */
function Memo({ character, onSaved }: { character: CharacterView; onSaved: (memo: string) => void }) {
  const [text, setText] = useState(character.memo); const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const latest = useRef(text);
  const save = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const memo = latest.current; setState("saving");
    try { await api(`/api/characters?id=${character.id}`, null, { method: "PATCH", body: JSON.stringify({ memo }) }); onSaved(memo); setState(latest.current === memo ? "saved" : "dirty"); }
    catch { setState("error"); }
  }, [character.id, onSaved]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <label className="mt-4 block">
    <span className="flex items-baseline justify-between text-xs font-semibold text-ink-muted">메모
      <span className={`font-normal ${state === "error" ? "text-warning" : "text-ink-faint"}`} aria-live="polite">
        {state === "saving" ? "저장 중…" : state === "dirty" ? "입력 중" : state === "error" ? "저장 실패 · 다시 입력하면 재시도" : "저장됨"}</span></span>
    <textarea className={`${field} mt-1 h-36 w-full resize-y`} maxLength={2000} value={text} placeholder="파티 일정, 남은 보스, 할 일 등을 적어 두세요."
      onChange={event => { setText(event.target.value); latest.current = event.target.value; setState("dirty");
        if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 800); }}
      onBlur={() => { if (timer.current) void save(); }} />
  </label>;
}

/** 목록에 보스 추가(게임 스케줄러에 등록하지 않은 보스). 캐릭터 레벨로 입장할 수 없는 보스는 뺀다. */
function AddBoss({ rows, level, onAdd }: { rows: BossRow[]; level: number | null; onAdd: (boss: Boss, difficulty: Difficulty) => void }) {
  const shown = new Set(rows.map(row => row.boss.key));
  const options = BOSSES.filter(boss => !shown.has(boss.key) && (level == null || level >= boss.level));
  const [key, setKey] = useState(""); const boss = options.find(item => item.key === key);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  if (!options.length) return null;
  return <div className="flex flex-wrap items-center gap-2">
    <select aria-label="추가할 보스" className={`${smallField} w-44`} value={key} onChange={event => { setKey(event.target.value); setDifficulty(""); }}>
      <option value="">보스 추가…</option>
      {options.map(item => <option key={item.key} value={item.key}>{item.name}{item.cycle !== "weekly" ? ` (${CYCLE_LABEL[item.cycle]})` : ""}</option>)}
    </select>
    {boss && <select aria-label="난이도" className={`${smallField} w-28`} value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty)}>
      <option value="">난이도</option>
      {boss.levels.map(item => <option key={item.difficulty} value={item.difficulty}>{DIFFICULTY_LABEL[item.difficulty]} · {eok(item.price)}</option>)}
    </select>}
    <button className={smallPrimary} disabled={!boss || !difficulty} onClick={() => { if (boss && difficulty) { onAdd(boss, difficulty); setKey(""); setDifficulty(""); } }}>추가</button>
  </div>;
}

/** 목록에서 삭제했지만 게임 스케줄러에는 아직 남아 있는 보스. 실수로 지웠으면 되돌린다. */
function HiddenBosses({ bosses, busy, onRestore }: { bosses: Boss[]; busy: string | null; onRestore: (boss: Boss) => void }) {
  if (!bosses.length) return null;
  return <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
    <span>목록에서 삭제함(게임 스케줄러에는 남아 있음):</span>
    {bosses.map(boss => <button key={boss.key} className="rounded-full border border-line px-2 py-0.5 text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
      aria-label={`${boss.name} 목록에 되돌리기`} disabled={busy === boss.key} onClick={() => onRestore(boss)}>{boss.short} 되돌리기</button>)}
  </p>;
}

function BossTable({ rows, busy, onParty, onClear, onDifficulty, onRemove }: {
  rows: BossRow[]; busy: string | null;
  onParty: (row: BossRow, party: number) => void; onClear: (row: BossRow, cleared: boolean) => void;
  onDifficulty: (row: BossRow, difficulty: Difficulty) => void; onRemove: (row: BossRow) => void;
}) {
  if (!rows.length) return <p className="rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center text-sm text-ink-muted">
    목록에 보스가 없습니다. 게임의 스케줄러에 주간 보스를 등록하거나 아래에서 직접 추가하세요.</p>;
  const item = (row: BossRow) => {
    const key = row.boss.key; const fromApi = row.clearSource === "api";
    return <li key={key} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_88px_132px_40px] ${row.overLimit ? "opacity-55" : ""}`}>
      <BossIcon boss={row.boss} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={`truncate text-sm font-semibold ${row.cleared ? "text-ink-muted line-through decoration-ink-faint/60" : ""}`}>{row.boss.name}</span>
          {row.boss.levels.length > 1 ? <select aria-label={`${row.boss.name} 난이도`} disabled={busy === key || row.cleared} value={row.difficulty}
            onChange={event => onDifficulty(row, event.target.value as Difficulty)} className="rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">
            {row.boss.levels.map(item => <option key={item.difficulty} value={item.difficulty}>{DIFFICULTY_LABEL[item.difficulty]}</option>)}
          </select> : <DifficultyChip difficulty={row.difficulty} />}
          {row.boss.cycle === "season" && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{CYCLE_LABEL[row.boss.cycle]}</span>}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {[row.registered ? "게임 스케줄러 등록" : null, row.added ? "직접 추가" : null, row.overLimit ? `주간 ${WEEKLY_BOSS_LIMIT}마리 초과 · 수익 제외` : null].filter(Boolean).join(" · ")}
          <button className="ml-2 text-ink-muted hover:text-danger hover:underline disabled:opacity-50" aria-label={`${row.boss.name} 목록에서 삭제`}
            title={row.registered ? "게임 스케줄러에 남아 있어도 이 목록과 예상 수익에서 뺍니다." : undefined} disabled={busy === key} onClick={() => onRemove(row)}>삭제</button>
        </p>
      </div>
      <label className="col-start-2 flex items-center gap-1.5 text-xs text-ink-muted sm:col-start-auto">인원
        <select aria-label={`${row.boss.name} 파티 인원`} value={row.partySize} disabled={busy === key} onChange={event => onParty(row, Number(event.target.value))}
          className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1 text-sm font-semibold text-ink">
          {Array.from({ length: row.maxParty }, (_, index) => index + 1).map(size => <option key={size} value={size}>{size}명</option>)}
        </select>
      </label>
      <div className="col-start-3 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
        <p className={`text-sm font-bold tabular-nums ${row.cleared ? "text-accent" : ""}`} title={`${number(row.share)} 메소`}>{eok(row.share)}</p>
        <p className="text-[11px] tabular-nums text-ink-faint">{row.partySize > 1 ? `${eok(row.price)} ÷ ${row.partySize}` : "솔로 정가"}</p>
      </div>
      <label className={`col-start-3 flex cursor-pointer items-center justify-end p-1 sm:col-start-auto ${fromApi ? "cursor-default" : ""}`}
        title={fromApi ? "넥슨 스케줄러에서 완료로 확인되었습니다." : "게임에서 잡았는데 아직 반영되지 않았으면 직접 체크하세요."}>
        {/* 넥슨이 완료로 확인한 처치는 풀 수 없지만, disabled로 흐리게 하지 않고 직접 체크와 같은 색으로 보여 준다. */}
        <input type="checkbox" className={`size-5 accent-(--accent) ${fromApi ? "pointer-events-none" : ""}`} aria-label={`${row.boss.name} 클리어`} aria-disabled={fromApi || undefined}
          checked={row.cleared} disabled={busy === key} onChange={event => { if (!fromApi) onClear(row, event.target.checked); }} />
      </label>
    </li>;
  };
  // 월간 보스(검은 마법사)는 초기화 주기와 12마리 제한이 달라 맨 아래에 따로 둔다.
  const weekly = rows.filter(row => row.boss.cycle !== "monthly"); const monthly = rows.filter(row => row.boss.cycle === "monthly");
  return <>
    {weekly.length > 0 && <ul className="divide-y divide-line">{weekly.map(item)}</ul>}
    {monthly.length > 0 && <section aria-label="월간 보스" className={weekly.length ? "mt-2 border-t-2 border-line pt-3" : ""}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"><span className="font-bold text-ink-muted">월간 보스</span>
        <span className="text-ink-faint">매월 1일 0시 초기화 · 주간 {WEEKLY_BOSS_LIMIT}마리와 따로 셈</span></p>
      <ul className="divide-y divide-line">{monthly.map(item)}</ul>
    </section>}
  </>;
}

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
/**
 * 계정 전체 결정석 수익 종합. 한 달의 주(목~수)별 수익과 월간 보스, 그 달 총 수익. 이번 주가 든 달을 먼저 보이고 ‹ ›로 지난 달을 본다.
 * 주는 시작일(목요일)이 속한 달에 넣는다(10/29~11/4 주는 10월).
 */
function IncomeSummary({ months, now }: { months: MonthIncome[]; now: number }) {
  const home = Math.max(0, months.findIndex(month => month.weeks.some(week => week.current)));
  const [offset, setOffset] = useState(0);
  const index = Math.min(months.length - 1, Math.max(0, home + offset)); const month = months[index];
  if (!month) return null;
  const title = Number(month.month.slice(5, 7));
  const range = month.weeks.length ? `${shortDate(month.weeks[0].start)} ~ ${shortDate(month.weeks.at(-1)!.end)}` : "";
  const value = (amount: number) => <span className="font-semibold tabular-nums" title={`${number(amount)} 메소`}>{amount > 0 ? eokShort(amount) : "-"}</span>;
  const arrow = "grid size-6 place-items-center rounded-md text-ink-muted hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  return <section className={card} aria-labelledby="income-title">
    <div className="flex items-center justify-between gap-2">
      <h2 id="income-title" className="text-sm font-bold">종합 <span className="font-medium text-ink-muted">({range})</span></h2>
      <div className="flex gap-0.5">
        <button type="button" className={arrow} aria-label="지난 달" disabled={index >= months.length - 1} onClick={() => setOffset(index + 1 - home)}>‹</button>
        <button type="button" className={arrow} aria-label="다음 달" disabled={index <= 0} onClick={() => setOffset(index - 1 - home)}>›</button>
      </div>
    </div>
    <ul className="mt-2 space-y-1.5 text-sm">
      {month.weeks.map(week => <li key={week.start} className="flex items-baseline justify-between gap-2">
        <span className={week.current ? "font-semibold text-info" : "text-ink-muted"}>{shortDate(week.start)} ~ {shortDate(week.end)}{week.current && <span className="ml-1 text-xs">(이번 주)</span>}</span>
        {value(week.amount)}
      </li>)}
      <li className="flex items-baseline justify-between gap-2"><span className="font-semibold text-accent">월간 보스</span>{value(month.monthly)}</li>
    </ul>
    <p className="mt-3 flex items-baseline justify-between gap-2 border-t border-line pt-3">
      <span className="text-sm font-bold">{month.month === monthStart(now).slice(0, 7) ? "이번 달" : `${title}월`} 총 수익</span>
      <span className="text-lg font-bold tabular-nums text-accent" title={`${number(month.total)} 메소`}>{month.total > 0 ? eokShort(month.total) : "-"}</span>
    </p>
  </section>;
}

/**
 * 주간 보스 탭. 등록한 캐릭터를 탭으로 보여주고, 캐릭터마다 이미지·레벨·메모와 주간 보스 목록(얼굴·이름·인원·결정석 몫·클리어)을 둔다.
 * 보스 목록과 클리어 여부는 넥슨 스케줄러 API(게임의 스케줄러 등록 상태)에서 가져오고, 직접 추가·체크도 할 수 있다.
 */
export default function BossPanel({ characters, onCharactersChanged, onCharacterUpdated, onUnauthorized }: {
  characters: CharacterView[]; onCharactersChanged: (select?: string) => void; onCharacterUpdated: (id: string, patch: Partial<CharacterView>) => void; onUnauthorized: () => void;
}) {
  const [data, setData] = useState<BossData | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  // 마지막으로 본 캐릭터 탭(이 브라우저). 로그인 뒤에만 그리는 화면이라 처음부터 저장소를 읽어도 된다.
  const [preferred, setPreferred] = useState<string | null>(() => { try { return localStorage.getItem(TAB); } catch { return null; } });
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const ids = characters.map(row => row.id).join(",");
  const load = useCallback(async (refresh = false, only?: string) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ ...(refresh ? { refresh: "1" } : {}), ...(only ? { character: only } : {}) });
      const next = await api<BossData>(`/api/bosses?${query}`);
      setData(next); setNow(next.now);
      for (const row of next.characters) onCharacterUpdated(row.id, { level: row.level, image: row.image, className: row.className, world: row.world });
    } catch (failure) { if (failure instanceof ApiError && failure.status === 401) onUnauthorized(); else setError(errorText(failure, "보스 정보를 불러오지 못했습니다.")); }
    finally { setLoading(false); }
  }, [onCharacterUpdated, onUnauthorized]);
  // 캐릭터가 바뀔 때(등록·해제) 다시 받고, 5분마다 넥슨 저장본을 새로 받는다.
  useEffect(() => {
    const first = setTimeout(() => void load(), 0); const timer = setInterval(() => void load(), 5 * 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load, ids]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const selected = characters.find(row => row.id === preferred)?.id ?? characters[0]?.id ?? null;
  function choose(id: string) { setPreferred(id); try { localStorage.setItem(TAB, id); } catch { /* 이번 화면에서만 */ } }

  const views = useMemo(() => new Map((data?.characters ?? []).map(row => [row.id, {
    row, rows: bossRows(row.state, row.settings, row.clears, now), hidden: hiddenBosses(row.state, row.settings, row.clears, now) }])), [data, now]);
  const account = useMemo(() => {
    let cleared = 0, planned = 0, monthly = 0, done = 0, total = 0;
    for (const { rows } of views.values()) {
      const totals = bossTotals(rows);
      cleared += totals.weekly.cleared; planned += totals.weekly.planned; monthly += totals.monthly.cleared;
      done += totals.weekly.clearedCount; total += totals.weekly.count;
    }
    return { cleared, planned, monthly, done, total };
  }, [views]);
  // 종합 표. 지난 주기는 저장된 처치 기록, 이번 주·이번 달은 위 합계(방금 체크한 처치 포함)와 같은 값을 쓴다.
  const months = useMemo(() => {
    if (!data) return [];
    const week = weekStart(now); const month = monthStart(now);
    const past = data.income.filter(row => row.period !== (row.cycle === "monthly" ? month : week));
    return incomeByMonth([...past, { characterId: "", period: week, cycle: "weekly", amount: account.cleared, count: 0, dropped: 0 },
      { characterId: "", period: month, cycle: "monthly", amount: account.monthly, count: 0, dropped: 0 }], now);
  }, [data, now, account]);

  function patchCharacter(id: string, change: (row: BossCharacter) => BossCharacter) {
    setData(current => current && { ...current, characters: current.characters.map(row => row.id === id ? change(row) : row) });
  }
  async function act(row: Pick<BossRow, "boss">, request: () => Promise<unknown>, optimistic: (character: BossCharacter) => BossCharacter) {
    if (!selected) return;
    const id = selected; const before = data; setBusy(row.boss.key); setNotice(""); patchCharacter(id, optimistic);
    try { await request(); }
    catch (failure) { setData(before); if (failure instanceof ApiError && failure.status === 401) onUnauthorized(); else setNotice(errorText(failure)); }
    finally { setBusy(null); }
  }
  const setting = (character: BossCharacter, key: string): BossSettingView => character.settings[key] ?? { difficulty: null, partySize: 1, added: false, hidden: false };
  const onParty = (row: BossRow, partySize: number) => act(row,
    () => api("/api/bosses", null, { method: "PATCH", body: JSON.stringify({ character: selected, boss: row.boss.key, partySize }) }),
    character => ({ ...character, settings: { ...character.settings, [row.boss.key]: { ...setting(character, row.boss.key), partySize } },
      clears: character.clears[row.boss.key] ? { ...character.clears, [row.boss.key]: { ...character.clears[row.boss.key], partySize } } : character.clears }));
  const onDifficulty = (row: BossRow, difficulty: Difficulty) => act(row,
    () => api("/api/bosses", null, { method: "PATCH", body: JSON.stringify({ character: selected, boss: row.boss.key, difficulty }) }),
    character => ({ ...character, settings: { ...character.settings, [row.boss.key]: { ...setting(character, row.boss.key), difficulty, partySize: Math.min(setting(character, row.boss.key).partySize, maxPartyOf(row.boss, difficulty)) } } }));
  const onClear = (row: BossRow, cleared: boolean) => act(row,
    () => api("/api/bosses", null, { method: "POST", body: JSON.stringify({ character: selected, boss: row.boss.key, difficulty: row.difficulty, cleared }) }),
    character => {
      const clears = { ...character.clears };
      if (cleared) clears[row.boss.key] = { period: row.period, difficulty: row.difficulty, partySize: row.partySize, price: levelOf(row.boss, row.difficulty)!.price, source: "manual" };
      else delete clears[row.boss.key];
      return { ...character, clears };
    });
  // 삭제: 게임 스케줄러에 등록돼 있어도 목록에서 뺀다(챌린저스 월드가 끝난 뒤에도 넥슨 API에 남는 시즌 보스 등).
  const onRemove = (row: BossRow) => act(row,
    () => api("/api/bosses", null, { method: "PATCH", body: JSON.stringify({ character: selected, boss: row.boss.key, hidden: true }) }),
    character => ({ ...character, settings: { ...character.settings, [row.boss.key]: { ...setting(character, row.boss.key), added: false, difficulty: null, hidden: true } } }));
  const onRestore = (boss: Boss) => act({ boss },
    () => api("/api/bosses", null, { method: "PATCH", body: JSON.stringify({ character: selected, boss: boss.key, hidden: false }) }),
    character => ({ ...character, settings: { ...character.settings, [boss.key]: { ...setting(character, boss.key), hidden: false } } }));
  const onAdd = (boss: Boss, difficulty: Difficulty) => act({ boss },
    () => api("/api/bosses", null, { method: "PATCH", body: JSON.stringify({ character: selected, boss: boss.key, added: true, difficulty }) }),
    character => ({ ...character, settings: { ...character.settings, [boss.key]: { ...setting(character, boss.key), added: true, difficulty, hidden: false } } }));
  async function remove(character: CharacterView) {
    if (!window.confirm(`${character.name} 캐릭터를 등록 해제할까요?\n이 캐릭터의 메모, 보스 설정·처치 기록, 사냥 기록이 함께 지워지며 되돌릴 수 없습니다.`)) return;
    try { await api(`/api/characters?id=${character.id}`, null, { method: "DELETE" }); onCharactersChanged(); }
    catch (failure) { setNotice(errorText(failure, "등록 해제하지 못했습니다.")); }
  }

  const resetIn = nextReset("weekly", now) - now;
  const current = characters.find(row => row.id === selected) ?? null;
  const view = current ? views.get(current.id) : undefined;
  const totals = view ? bossTotals(view.rows) : null;
  const limit = view?.row.state?.weeklyLimit || WEEKLY_BOSS_LIMIT;

  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">주간 <span className="text-accent">보스</span></h1>
        <p className="mt-1 text-sm text-ink-muted">이번 주 {weekLabel(weekStart(now))} · 초기화까지 <span className="tabular-nums">{left(resetIn)}</span></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={loading || !characters.length} onClick={() => void load(true)}>{loading ? "넥슨에서 받는 중…" : "넥슨 새로고침"}</button>
        <button className={primary} onClick={() => setRegistering(!registering)}>캐릭터 등록</button>
      </div>
    </header>

    {registering && <section className={card} aria-label="캐릭터 등록">
      <h2 className="text-base font-bold tracking-tight">캐릭터 <span className="text-accent">등록</span></h2>
      <p className="mb-3 mt-1 text-sm text-ink-muted">게임 캐릭터명을 넣으면 넥슨 API로 이미지·레벨·직업과 게임 스케줄러에 등록한 보스를 가져옵니다.</p>
      <RegisterForm onCancel={() => setRegistering(false)} onDone={(character, warning) => {
        setRegistering(false); choose(character.id); onCharactersChanged(character.id);
        setNotice(warning ? `${character.name} 등록 완료 · 보스 정보는 아직 받지 못했습니다: ${warning}` : `${character.name} 캐릭터를 등록했습니다.`);
      }} />
    </section>}
    {error && <p role="alert" className="text-sm text-warning">{error}</p>}
    {notice && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
    {data && !data.nexon && <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">서버에 넥슨 API 키(NEXON_API_KEY)가 없어 캐릭터 이미지·레벨과 게임 스케줄러의 보스·클리어 여부를 가져오지 못합니다. 보스는 직접 추가·체크할 수 있습니다.</p>}

    {!characters.length ? <section className={`${card} text-center`}>
      <h2 className="text-lg font-bold tracking-tight">먼저 캐릭터를 등록하세요</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">등록한 캐릭터마다 탭이 생기고, 게임 스케줄러에 등록한 주간 보스와 클리어 여부, 결정석 수익을 볼 수 있습니다.</p>
      {!registering && <div className="mt-4 flex justify-center"><RegisterForm onDone={character => { choose(character.id); onCharactersChanged(character.id); }} /></div>}
    </section> : <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["이번 주 결정석 수익", eok(account.cleared), `전체 캐릭터 · 처치 ${account.done}마리`], ["이번 주 예상 수익", eok(account.planned), `목록 ${account.total}마리를 모두 잡으면`],
          ["남은 수익", eok(Math.max(0, account.planned - account.cleared)), `${Math.max(0, account.total - account.done)}마리 남음`], ["이번 달 월간 보스", eok(account.monthly), "검은 마법사"]] as const)
          .map(([label, value, sub], index) => <div key={label} className={`rounded-2xl border px-4 py-3 shadow-card ${index === 0 ? "border-accent/40 bg-accent/5" : "border-line bg-surface-1"}`}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className={`mt-1 text-xl font-bold tabular-nums ${index === 0 ? "text-accent" : ""}`}>{value}</dd>
            <dd className="text-xs text-ink-faint">{sub}</dd>
          </div>)}
      </dl>

      {/* 캐릭터 탭. 넘치면 가로로 스크롤한다. */}
      <div role="tablist" aria-label="캐릭터" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {characters.map(row => {
          const item = views.get(row.id); const sum = item ? bossTotals(item.rows) : null; const active = row.id === selected;
          return <button key={row.id} id={`boss-tab-${row.id}`} type="button" role="tab" aria-selected={active} aria-controls="boss-panel" tabIndex={active ? 0 : -1}
            onClick={() => choose(row.id)}
            onKeyDown={event => {
              const index = characters.findIndex(item => item.id === row.id); const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key]; if (!move) return;
              const next = characters[(index + move + characters.length) % characters.length]; choose(next.id); document.getElementById(`boss-tab-${next.id}`)?.focus();
            }}
            className={`flex min-w-[168px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active
              ? "border-accent bg-accent/10 shadow-card" : "border-line bg-surface-1 hover:bg-surface-2"}`}>
            <CharacterAvatar name={row.name} image={row.image} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              <span className="block text-xs tabular-nums text-ink-muted">{row.level != null ? `Lv.${row.level}` : "레벨 —"}{sum ? ` · ${sum.weekly.clearedCount}/${sum.weekly.count}` : ""}</span>
            </span>
          </button>;
        })}
      </div>

      {current && <div id="boss-panel" role="tabpanel" aria-labelledby={`boss-tab-${current.id}`} className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <section className={`${card} lg:col-start-1 lg:row-start-1`} aria-label={`${current.name} 정보`}>
          <div className="flex flex-col items-center text-center">
            <CharacterAvatar name={current.name} image={current.image} size="xl" />
            <h2 className="mt-2 text-xl font-bold tracking-tight">{current.name}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{current.level != null ? <b className="text-ink">Lv.{current.level}</b> : "레벨 미확인"}{current.className ? ` · ${current.className}` : ""}{current.world ? ` · ${current.world}` : ""}</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-[11px] text-ink-muted">이번 주 수익</dt><dd className="text-sm font-bold tabular-nums text-accent">{eok(totals?.weekly.cleared ?? 0)}</dd></div>
            <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-[11px] text-ink-muted">처치</dt><dd className="text-sm font-bold tabular-nums">{totals?.weekly.clearedCount ?? 0} / {totals?.weekly.count ?? 0}</dd></div>
          </dl>
          <Memo key={current.id} character={current} onSaved={memo => onCharacterUpdated(current.id, { memo })} />
          <p className="mt-3 text-xs text-ink-faint">넥슨 동기화 {ago(view?.row.syncedAt ?? null, now)}{view?.row.state && !view.row.state.weeklyStale && view.row.state.weeklyCount != null ? ` · 게임 기준 주간 처치 ${view.row.state.weeklyCount}/${view.row.state.weeklyLimit ?? limit}` : ""}</p>
          {view?.row.error && <p className="mt-1 text-xs text-warning">{view.row.error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={smallButton} disabled={loading} onClick={() => void load(true, current.id)}>이 캐릭터 새로고침</button>
            <button className={`${smallButton} text-warning`} onClick={() => void remove(current)}>등록 해제</button>
          </div>
        </section>

        <section className={`${card} lg:col-start-2 lg:row-span-2 lg:row-start-1`} aria-labelledby="boss-list-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="boss-list-title" className="text-base font-bold tracking-tight">보스 <span className="text-accent">목록</span>
              <span className="ml-2 align-middle text-xs font-medium text-ink-muted">주간 {totals?.weekly.count ?? 0}/{limit}마리 · 예상 {eok(totals?.weekly.planned ?? 0)}</span></h2>
            <p className="text-xs text-ink-faint">결정석은 1인 판매가 ÷ 인원(소수점 버림)</p>
          </div>
          {view?.row.state?.weeklyStale && <p className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted">넥슨 스케줄러에 이번 주 보스 정보가 없습니다(오래 접속하지 않은 캐릭터 등). 게임에 접속하면 몇 분 뒤 반영됩니다.</p>}
          <BossTable rows={view?.rows ?? []} busy={busy} onParty={onParty} onClear={onClear} onDifficulty={onDifficulty} onRemove={onRemove} />
          <HiddenBosses bosses={view?.hidden ?? []} busy={busy} onRestore={boss => void onRestore(boss)} />
          <div className="mt-4 border-t border-line pt-4"><AddBoss rows={view?.rows ?? []} level={current.level} onAdd={(boss, difficulty) => void onAdd(boss, difficulty)} /></div>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">게임의 스케줄러에 등록한 보스와 클리어 여부는 넥슨 Open API에서 5분마다 가져옵니다(게임 반영은 몇 분 늦을 수 있음). 아직 반영되지 않은 처치는 직접 체크하고, 실제로 잡지 않는 보스(이벤트가 끝난 시즌 보스 등)는 삭제하세요.
            주간 보스는 캐릭터당 {limit}마리까지 결정석을 팔 수 있어 몫이 큰 순서로 {limit}마리만 예상 수익에 넣습니다.</p>
        </section>
        {/* 넓은 화면에서는 캐릭터 정보 아래 빈 곳, 좁은 화면에서는 보스 목록 아래. */}
        <div className="lg:col-start-1 lg:row-start-2"><IncomeSummary months={months} now={now} /></div>
      </div>}
    </>}
  </div>;
}
