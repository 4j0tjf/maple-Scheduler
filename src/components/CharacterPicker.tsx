"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CharacterView } from "@/services/client";
import CharacterAvatar from "./CharacterAvatar";

const describe = (row: CharacterView) => [row.level != null ? `Lv.${row.level}` : null, row.className, row.world].filter(Boolean).join(" · ");

/**
 * 기록할 캐릭터 고르기. 등록한 캐릭터를 이미지·레벨·닉네임으로 보여주는 드롭다운(WAI-ARIA listbox)이다.
 * 사냥 기록은 예전처럼 캐릭터명·비밀번호를 넣지 않고 로그인한 계정의 캐릭터 중에서 고른다.
 */
export default function CharacterPicker({ characters, value, onChange, disabled, disabledReason }: {
  characters: CharacterView[]; value: string | null; onChange: (row: CharacterView | null) => void; disabled?: boolean; disabledReason?: string;
}) {
  const [open, setOpen] = useState(false); const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null); const list = useRef<HTMLUListElement>(null); const id = useId();
  const selected = characters.find(row => row.id === value) ?? null;
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    list.current?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  function toggle() {
    if (disabled) return;
    setFocus(Math.max(0, characters.findIndex(row => row.id === value))); setOpen(!open);
  }
  function choose(row: CharacterView) { onChange(row); setOpen(false); root.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
  function key(event: React.KeyboardEvent) {
    if (event.key === "Escape") { setOpen(false); root.current?.querySelector<HTMLButtonElement>("button")?.focus(); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (characters[focus]) choose(characters[focus]); return; }
    const move = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setFocus(index => Math.max(0, Math.min(characters.length - 1, Number.isFinite(move) ? index + move : move > 0 ? characters.length - 1 : 0)));
  }
  return <div ref={root} className="relative w-full sm:w-[320px]">
    <p id={`${id}-label`} className="mb-1 text-xs font-medium text-ink-muted">기록할 캐릭터</p>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} disabled={disabled} title={disabled ? disabledReason : undefined}
      onClick={toggle} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); if (!open) toggle(); } }}
      className="flex w-full items-center gap-3 rounded-xl border border-line-strong bg-surface-1 px-3 py-2 text-left shadow-card hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {selected ? <CharacterAvatar name={selected.name} image={selected.image} /> : <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-ink-faint">?</span>}
      <span id={`${id}-value`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{selected?.name ?? (characters.length ? "캐릭터 선택" : "등록한 캐릭터 없음")}</span>
        <span className="block truncate text-xs text-ink-muted">{selected ? describe(selected) || "넥슨 정보 없음" : characters.length ? `${characters.length}명 중에서 고르세요` : "주간 보스 탭에서 캐릭터를 등록하세요"}</span>
      </span>
      <svg aria-hidden viewBox="0 0 20 20" className={`size-4 shrink-0 fill-ink-faint transition ${open ? "rotate-180" : ""}`}><path d="M5.2 7.6 10 12.4l4.8-4.8 1.1 1.1L10 14.6 4.1 8.7z" /></svg>
    </button>
    {open && <ul ref={list} role="listbox" tabIndex={-1} aria-labelledby={`${id}-label`} aria-activedescendant={characters[focus] ? `${id}-${characters[focus].id}` : undefined} onKeyDown={key}
      className="absolute right-0 z-40 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-surface-1 p-1.5 shadow-card focus:outline-none">
      {!characters.length && <li className="px-3 py-4 text-center text-sm text-ink-muted">등록한 캐릭터가 없습니다.</li>}
      {characters.map((row, index) => <li key={row.id} id={`${id}-${row.id}`} role="option" aria-selected={row.id === value}
        onPointerEnter={() => setFocus(index)} onClick={() => choose(row)}
        className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${index === focus ? "bg-surface-3" : ""} ${row.id === value ? "ring-1 ring-accent/50" : ""}`}>
        <CharacterAvatar name={row.name} image={row.image} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{row.name}</span>
          <span className="block truncate text-xs text-ink-muted">{describe(row) || "넥슨 정보 없음"}</span>
        </span>
        {row.level != null && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-muted">Lv.{row.level}</span>}
      </li>)}
    </ul>}
  </div>;
}
