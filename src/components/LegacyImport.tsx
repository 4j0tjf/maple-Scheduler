"use client";

import { useEffect, useState } from "react";
import { api, errorText } from "@/services/client";
import { card, smallField, smallPrimary } from "./ui";

type Imported = { legacyName: string; characterId: string; records: number; importedAt: string };
type Result = { character: { id: string; name: string }; records: number; updated: number; skipped: number; evidence: number };

/**
 * 기존 사냥 기록(/hunting)에서 쓰던 캐릭터명·비밀번호로 그 기록을 이 계정으로 가져온다.
 * 기존 기록은 지우지 않으며, 다시 가져오면 그 뒤에 기존 화면에서 저장한 기록만 더한다.
 */
export default function LegacyImport({ onImported }: { onImported: (characterId: string) => void }) {
  const [status, setStatus] = useState<{ available: boolean; imports: Imported[] } | null>(null);
  const [name, setName] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  // 처음에는 가져온 적이 없을 때만 펼친다. 가져온 뒤에도 결과 문구가 보이도록 접지 않는다.
  const [open, setOpen] = useState<boolean | null>(null);
  const load = () => api<{ available: boolean; imports: Imported[] }>("/api/hunt-import")
    .then(next => { setStatus(next); setOpen(current => current ?? !next.imports.length); }).catch(() => setStatus(null));
  useEffect(() => { void load(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<Result>("/api/hunt-import", null, { method: "POST", body: JSON.stringify({ name, password }) });
      setPassword("");
      setMessage(`${result.character.name}: 새 기록 ${result.records}건${result.updated ? ` · 갱신 ${result.updated}건` : ""} · 증거 이미지 ${result.evidence}장을 가져왔습니다.${result.skipped ? ` (다른 캐릭터에 이미 있는 기록 ${result.skipped}건은 건너뜀)` : ""}`);
      onImported(result.character.id); void load();
    } catch (failure) { setError(errorText(failure, "가져오지 못했습니다.")); }
    finally { setBusy(false); }
  }
  if (!status?.available) return null;
  return <section className={card} aria-labelledby="legacy-import">
    <details open={open ?? false} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">
        <h2 id="legacy-import" className="inline text-base font-bold tracking-tight">기존 사냥 기록 <span className="text-accent">가져오기</span></h2>
        <span className="ml-2 text-xs text-ink-muted">{status.imports.length ? `가져온 캐릭터 ${status.imports.length}명` : "예전 사냥 기록 화면의 기록을 옮깁니다"}</span>
      </summary>
      <p className="mt-3 text-sm text-ink-muted">예전 사냥 기록 화면에서 쓰던 <b>캐릭터명과 그 캐릭터 비밀번호</b>를 넣으면 기록과 증거 이미지를 이 계정의 같은 이름 캐릭터로 옮깁니다(없으면 등록합니다). 기존 기록은 지우지 않고, 다시 가져오면 그 뒤에 쌓인 기록만 더합니다.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={event => void submit(event)}>
        <input className={`${smallField} w-36`} aria-label="기존 캐릭터명" placeholder="캐릭터명" value={name} maxLength={12} required onChange={event => setName(event.target.value)} />
        <input className={`${smallField} w-40`} aria-label="기존 캐릭터 비밀번호" placeholder="기존 비밀번호" type="password" autoComplete="off" value={password} maxLength={64} required onChange={event => setPassword(event.target.value)} />
        <button className={smallPrimary} disabled={busy}>{busy ? "가져오는 중…" : "가져오기"}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-warning">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-success">{message}</p>}
      {status.imports.length > 0 && <ul className="mt-3 space-y-1 text-xs text-ink-muted">{status.imports.map(row => <li key={`${row.legacyName}-${row.characterId}`}>
        {row.legacyName} · 기록 {row.records.toLocaleString("ko-KR")}건 · {new Date(row.importedAt).toLocaleString("ko-KR")} 가져옴</li>)}</ul>}
    </details>
  </section>;
}
