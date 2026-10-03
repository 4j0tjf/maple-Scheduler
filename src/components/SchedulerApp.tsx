"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorText, type Account, type CharacterView } from "@/services/client";
import AuthCard from "./AuthCard";
import BossPanel from "./BossPanel";
import CrystalPanel from "./CrystalPanel";
import HuntingDashboard from "./HuntingDashboard";
import ProfitPanel from "./ProfitPanel";
import { card, smallButton } from "./ui";

/**
 * 왼쪽 탭. 주소 끝(#bosses 등)으로 바로 열 수 있다.
 * 사냥 기록은 한 번 열면 숨기기만 해서 다른 탭을 보는 동안에도 화면 스캔·기록이 계속된다.
 */
const TABS = [
  { key: "bosses", label: "주간 보스", login: true, icon: "M4 20h16M6 20V9l6-5 6 5v11M10 20v-5h4v5" },
  { key: "crystals", label: "결정석 가격", login: false, icon: "M12 3 4 9l8 12 8-12-8-6ZM4 9h16M9 9l3 12 3-12" },
  { key: "hunting", label: "사냥 기록", login: true, icon: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 2.5M9 2h6" },
  { key: "profit", label: "사냥 수익", login: true, icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const tabOf = (hash: string): Tab => {
  const key = hash.replace(/^#/, "").split("-")[0];
  return (TABS.find(tab => tab.key === key)?.key ?? "bosses") as Tab;
};

export default function SchedulerApp() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [characters, setCharacters] = useState<CharacterView[]>([]); const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("bosses"); const [huntOpened, setHuntOpened] = useState(false); const [scanning, setScanning] = useState(false);

  const loadCharacters = useCallback(async () => {
    try { setCharacters((await api<{ characters: CharacterView[] }>("/api/characters")).characters); setError(""); }
    catch (failure) { if (failure instanceof ApiError && failure.status === 401) setAccount(null); else setError(errorText(failure, "캐릭터 목록을 불러오지 못했습니다.")); }
  }, []);
  useEffect(() => {
    const read = () => { const next = tabOf(window.location.hash); setTab(next); if (next === "hunting") setHuntOpened(true); };
    read(); window.addEventListener("hashchange", read);
    api<{ account: Account | null }>("/api/session").then(data => { setAccount(data.account); if (data.account) void loadCharacters(); })
      .catch(failure => { setAccount(null); setError(errorText(failure, "계정 저장소에 연결할 수 없습니다.")); });
    return () => window.removeEventListener("hashchange", read);
  }, [loadCharacters]);

  function choose(next: Tab) {
    setTab(next); if (next === "hunting") setHuntOpened(true);
    try { window.history.replaceState(null, "", `#${next}`); } catch { /* 주소만 그대로 */ }
  }
  function login(next: Account) { setAccount(next); setCharacters([]); void loadCharacters(); }
  async function logout() {
    if (scanning) return;
    await api("/api/session", null, { method: "DELETE" }).catch(() => {});
    setAccount(null); setCharacters([]); setHuntOpened(false);
  }
  const unauthorized = useCallback(() => setAccount(null), []);
  const updateCharacter = useCallback((id: string, patch: Partial<CharacterView>) => {
    setCharacters(list => {
      const index = list.findIndex(row => row.id === id); if (index < 0) return list;
      const merged = { ...list[index], ...patch };
      if ((Object.keys(patch) as (keyof CharacterView)[]).every(key => list[index][key] === merged[key])) return list;
      const next = [...list]; next[index] = merged; return next;
    });
  }, []);
  const onScanning = useCallback((running: boolean) => setScanning(running), []);
  const current = TABS.find(item => item.key === tab)!;
  const loggedIn = !!account;

  return <main className="mx-auto w-full min-w-0 max-w-[1500px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <div className="grid items-start gap-6 lg:grid-cols-[208px_minmax(0,1fr)]">
      {/* 넓은 화면: 왼쪽 세로 탭. 좁은 화면: 위쪽 가로 탭. */}
      <aside className="min-w-0 lg:sticky lg:top-[67px]">
        <div className="flex items-center justify-between gap-3 lg:block">
          <p className="text-lg font-bold tracking-tight">스케줄러</p>
          {account && <div className="flex items-center gap-2 lg:mt-2">
            <span className="truncate text-xs text-ink-muted" title="로그인한 아이디">{account.username}</span>
            <button className={`${smallButton} shrink-0`} disabled={scanning} title={scanning ? "스캔을 중지한 뒤 로그아웃하세요." : undefined} onClick={() => void logout()}>로그아웃</button>
          </div>}
        </div>
        <nav aria-label="스케줄러 메뉴" className="mt-3 lg:mt-5">
          <ul role="tablist" aria-orientation="vertical" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
            {TABS.map(item => <li key={item.key} role="presentation" className="shrink-0">
              <button type="button" role="tab" id={`tab-${item.key}`} aria-selected={tab === item.key} aria-controls={`panel-${item.key}`} onClick={() => choose(item.key)}
                onKeyDown={event => {
                  const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]; if (!move) return;
                  event.preventDefault(); const index = TABS.findIndex(entry => entry.key === tab);
                  const next = TABS[(index + move + TABS.length) % TABS.length].key; choose(next); document.getElementById(`tab-${next}`)?.focus();
                }}
                tabIndex={tab === item.key ? 0 : -1}
                className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tab === item.key
                  ? "bg-accent/10 text-accent ring-1 ring-accent/30" : "text-ink-muted hover:bg-surface-1 hover:text-ink"}`}>
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[18px] shrink-0"><path d={item.icon} /></svg>
                {item.label}
                {item.key === "hunting" && scanning && <span aria-label="스캔 중" className="ml-auto inline-block size-2 animate-pulse rounded-full bg-accent" />}
              </button>
            </li>)}
          </ul>
        </nav>
        {loggedIn && <p className="mt-4 hidden text-xs leading-relaxed text-ink-faint lg:block">캐릭터 {characters.length}명 등록<br />Data based on NEXON Open API</p>}
      </aside>

      <div className="min-w-0">
        {error && <p role="alert" className="mb-4 text-sm text-warning">{error}</p>}
        {account === undefined ? <section className={`${card} text-center text-sm text-ink-muted`}>불러오는 중…</section> : <>
          {current.login && !loggedIn && <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-6">
            <header>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{current.label}</h1>
              <p className="mt-1 text-sm text-ink-muted">로그인하면 등록한 캐릭터별 주간 보스·사냥 기록·수익을 볼 수 있습니다. 결정석 가격은 로그인 없이 볼 수 있습니다.</p>
            </header>
            <AuthCard onLogin={login} />
          </div>}
          {loggedIn && <div id="panel-bosses" role="tabpanel" aria-labelledby="tab-bosses" hidden={tab !== "bosses"}>
            {tab === "bosses" && <BossPanel characters={characters} onCharactersChanged={() => void loadCharacters()} onCharacterUpdated={updateCharacter} onUnauthorized={unauthorized} />}
          </div>}
          <div id="panel-crystals" role="tabpanel" aria-labelledby="tab-crystals" hidden={tab !== "crystals"}>{tab === "crystals" && <CrystalPanel />}</div>
          {loggedIn && huntOpened && <div id="panel-hunting" role="tabpanel" aria-labelledby="tab-hunting" hidden={tab !== "hunting"}>
            <HuntingDashboard characters={characters} onUnauthorized={unauthorized} onRunning={onScanning} onCharactersChanged={() => void loadCharacters()} />
          </div>}
          {loggedIn && <div id="panel-profit" role="tabpanel" aria-labelledby="tab-profit" hidden={tab !== "profit"}>
            <ProfitPanel active={tab === "profit"} onUnauthorized={unauthorized} />
          </div>}
        </>}
      </div>
    </div>
  </main>;
}
