"use client";

import { useState } from "react";
import { api, errorText, type Account } from "@/services/client";
import { card, field, primary } from "./ui";

/**
 * 로그인·회원가입. 아이디와 비밀번호만 받는다(이메일·캐릭터 인증 없음).
 * 가입하면 바로 로그인되고, 로그인은 이 브라우저에서 30일 유지된다.
 */
export default function AuthCard({ onLogin, compact = false }: { onLogin: (account: Account) => void; compact?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "signup" && password !== confirm) { setError("비밀번호 확인이 일치하지 않습니다."); return; }
    setBusy(true);
    try {
      const { account } = await api<{ account: Account }>("/api/session", null, { method: "POST", body: JSON.stringify({ mode, username, password }) });
      setPassword(""); setConfirm(""); onLogin(account);
    } catch (failure) { setError(errorText(failure, mode === "signup" ? "가입하지 못했습니다." : "로그인하지 못했습니다.")); }
    finally { setBusy(false); }
  }
  const signup = mode === "signup";
  return <section className={`${card} mx-auto w-full max-w-md`} aria-labelledby="auth-title">
    {!compact && <p className="text-xs font-semibold text-accent">스케줄러</p>}
    <h2 id="auth-title" className="mt-1 text-xl font-bold tracking-tight">{signup ? "회원가입" : "로그인"}</h2>
    <p className="mt-1 text-sm text-ink-muted">{signup ? "아이디와 비밀번호만 정하면 됩니다. 메이플 계정 비밀번호와 다르게 정하세요." : "주간 보스·사냥 기록은 계정에 등록한 캐릭터별로 저장됩니다."}</p>
    <div role="tablist" aria-label="로그인 또는 회원가입" className="mt-4 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm font-semibold">
      {(["login", "signup"] as const).map(key => <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => { setMode(key); setError(""); }}
        className={`rounded-md py-1.5 ${mode === key ? "bg-surface-1 text-ink shadow-card" : "text-ink-muted hover:text-ink"}`}>{key === "login" ? "로그인" : "회원가입"}</button>)}
    </div>
    <form className="mt-4 space-y-3" onSubmit={event => void submit(event)}>
      <label className="block text-sm font-medium">아이디
        <input className={`${field} mt-1 w-full`} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required
          minLength={4} maxLength={40} title="영문·숫자로 시작하는 4~40자. 영문·숫자와 . _ - @ 사용 가능(이메일 주소도 가능)" placeholder="영문·숫자 4~40자 (이메일도 가능)" />
      </label>
      <label className="block text-sm font-medium">비밀번호
        <input className={`${field} mt-1 w-full`} type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={6} maxLength={72}
          autoComplete={signup ? "new-password" : "current-password"} placeholder="6자 이상" />
      </label>
      {signup && <label className="block text-sm font-medium">비밀번호 확인
        <input className={`${field} mt-1 w-full`} type="password" value={confirm} onChange={event => setConfirm(event.target.value)} required minLength={6} maxLength={72} autoComplete="new-password" />
      </label>}
      {error && <p role="alert" className="text-sm text-warning">{error}</p>}
      <button className={`${primary} w-full`} disabled={busy}>{busy ? "확인 중…" : signup ? "가입하고 시작하기" : "로그인"}</button>
    </form>
    <p className="mt-3 text-xs text-ink-faint">비밀번호 찾기는 없습니다. 잊으면 관리자에게 계정 정리를 요청하세요.</p>
  </section>;
}
