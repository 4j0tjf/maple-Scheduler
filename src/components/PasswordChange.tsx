"use client";

import { useState } from "react";
import { api, errorText } from "@/services/client";
import { smallButton, smallField, smallPrimary } from "./ui";

/**
 * 비밀번호 변경. 지금 비밀번호를 확인한 뒤 바꾼다.
 * 바꾸면 다른 기기의 로그인은 끊기고 이 브라우저는 로그인이 유지된다.
 * 관리자가 초기화해 준 임시 비밀번호로 들어왔을 때도 여기서 바꾼다.
 */
export default function PasswordChange({ onClose }: { onClose: (changed: boolean) => void }) {
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (next !== confirm) { setError("새 비밀번호 확인이 일치하지 않습니다."); return; }
    if (next === current) { setError("지금 비밀번호와 다른 비밀번호를 입력하세요."); return; }
    setBusy(true);
    try { await api("/api/session", null, { method: "PATCH", body: JSON.stringify({ current, next }) }); onClose(true); }
    catch (failure) { setError(errorText(failure, "비밀번호를 바꾸지 못했습니다.")); }
    finally { setBusy(false); }
  }
  const input = `${smallField} w-full`;
  return <form className="mt-3 space-y-2 rounded-xl border border-line bg-surface-1 p-3 shadow-card" aria-label="비밀번호 변경" onSubmit={event => void submit(event)}>
    <p className="text-sm font-semibold">비밀번호 변경</p>
    <input className={input} type="password" aria-label="지금 비밀번호" placeholder="지금 비밀번호" autoComplete="current-password" required maxLength={72}
      value={current} onChange={event => setCurrent(event.target.value)} />
    <input className={input} type="password" aria-label="새 비밀번호" placeholder="새 비밀번호 (6자 이상)" autoComplete="new-password" required minLength={6} maxLength={72}
      value={next} onChange={event => setNext(event.target.value)} />
    <input className={input} type="password" aria-label="새 비밀번호 확인" placeholder="새 비밀번호 확인" autoComplete="new-password" required minLength={6} maxLength={72}
      value={confirm} onChange={event => setConfirm(event.target.value)} />
    {error && <p role="alert" className="text-xs text-warning">{error}</p>}
    <div className="flex gap-1.5">
      <button className={smallPrimary} disabled={busy}>{busy ? "바꾸는 중…" : "변경"}</button>
      <button type="button" className={smallButton} onClick={() => onClose(false)}>취소</button>
    </div>
    <p className="text-[11px] leading-relaxed text-ink-faint">바꾸면 다른 기기의 로그인은 끊깁니다.</p>
  </form>;
}
