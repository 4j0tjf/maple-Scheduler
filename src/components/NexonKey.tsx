"use client";

import { useEffect, useState } from "react";
import { api, ApiError, errorText } from "@/services/client";
import { smallButton, smallField, smallPrimary } from "./ui";

type KeyStatus = { registered: boolean; hint: string | null; health: {
  state: "unknown" | "ok" | "invalid" | "limited" | "maintenance" | "unavailable"; checkedAt: string | null; successAt: string | null;
} | null };
const healthText = { unknown: "아직 확인하지 않음", ok: "정상", invalid: "키 또는 권한 확인 필요", limited: "호출 한도 초과", maintenance: "넥슨 점검 중", unavailable: "넥슨 연결 불가" };

/**
 * 계정의 넥슨 Open API 키 등록·바꾸기·삭제. 이 계정 캐릭터의 넥슨 조회는 모두 이 키로 한다.
 * 키 전체는 서버에만 두고, 화면에는 앞머리(test_·live_)와 끝 4자만 보인다.
 * compact는 주간 보스 탭 안내문 안에 넣을 때(제목·닫기 없이 입력만).
 */
export default function NexonKey({ onChanged, onClose, onUnauthorized, compact = false }: {
  onChanged: (registered: boolean) => void; onClose?: () => void; onUnauthorized?: () => void; compact?: boolean;
}) {
  const [status, setStatus] = useState<KeyStatus | null>(null); const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    api<KeyStatus>("/api/nexon-key").then(next => { if (alive) setStatus(next); })
      .catch(failure => { if (!alive) return; if (failure instanceof ApiError && failure.status === 401) onUnauthorized?.(); else setError(errorText(failure, "키 등록 여부를 불러오지 못했습니다.")); });
    return () => { alive = false; };
  }, [onUnauthorized]);

  async function send(init: RequestInit, done: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await api<KeyStatus>("/api/nexon-key", null, init);
      setStatus(next); setKey(""); setNotice(done); if (init.method !== "POST") onChanged(next.registered);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) onUnauthorized?.(); else setError(errorText(failure, "넥슨 API 키를 저장하지 못했습니다."));
    } finally { setBusy(false); }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    void send({ method: "PUT", body: JSON.stringify({ key }) }, status?.registered ? "넥슨 API 키를 바꿨습니다." : "넥슨 API 키를 등록했습니다.");
  }
  function remove() {
    if (!window.confirm("넥슨 API 키를 삭제할까요?\n이미 받아 둔 캐릭터 정보와 처치 기록은 남지만, 그 뒤로는 넥슨에서 새로 받지 않습니다.")) return;
    void send({ method: "DELETE" }, "넥슨 API 키를 삭제했습니다.");
  }

  const form = <form className="space-y-2" aria-label="넥슨 API 키" onSubmit={submit}>
    <p className="text-xs text-ink-muted">{status === null ? "불러오는 중…" : status.registered
      ? <>등록된 키 <span className="font-mono text-ink">{status.hint}</span></> : "이 계정에 등록된 키가 없습니다."}</p>
    <div className="flex flex-wrap gap-1.5">
      <input className={`${smallField} min-w-0 flex-1 basis-40`} type="password" aria-label="넥슨 Open API 키" autoComplete="off" spellCheck={false}
        placeholder={status?.registered ? "새 키로 바꾸기" : "넥슨 Open API 키"} required maxLength={200} value={key} onChange={event => setKey(event.target.value)} />
      <button className={smallPrimary} disabled={busy || !key.trim()}>{busy ? "넥슨에서 확인 중…" : status?.registered ? "바꾸기" : "등록"}</button>
    </div>
    {status?.health && <div className="text-xs text-ink-muted" aria-live="polite">
      <p>연결 상태: {healthText[status.health.state]}</p>
      {status.health.checkedAt && <p>최근 확인: {new Date(status.health.checkedAt).toLocaleString("ko-KR")}</p>}
      {status.health.successAt && <p>최근 정상 응답: {new Date(status.health.successAt).toLocaleString("ko-KR")}</p>}
      <p className="text-ink-faint">연결 상태와 시간은 서버 재시작 후의 조회 기준입니다.</p>
    </div>}
    {error && <p role="alert" className="text-xs text-warning">{error}</p>}
    {status?.registered && <button type="button" className={smallButton} disabled={busy} onClick={() => void send({ method: "POST" }, "키 상태를 다시 확인했습니다.")}>연결 재확인</button>}
    {notice && <p role="status" className="text-xs text-success">{notice}</p>}
  </form>;
  if (compact) return form;
  return <section className="mt-3 space-y-2 rounded-xl border border-line bg-surface-1 p-3 shadow-card" aria-label="넥슨 API 키 설정">
    <p className="text-sm font-semibold">넥슨 API 키</p>
    {form}
    <div className="flex gap-1.5">
      {status?.registered && <button type="button" className={smallButton} disabled={busy} onClick={remove}>키 삭제</button>}
      {onClose && <button type="button" className={smallButton} onClick={onClose}>닫기</button>}
    </div>
    <p className="text-[11px] leading-relaxed text-ink-faint">
      <a className="underline hover:text-ink" href="https://openapi.nexon.com/" target="_blank" rel="noreferrer">openapi.nexon.com</a>에서 애플리케이션을 등록하면 받는 키입니다.
      이 계정 캐릭터의 이미지·레벨, 게임 스케줄러의 보스·클리어, 사냥 효율 정보를 이 키로 가져옵니다. 다른 넥슨 ID의 캐릭터도 이름으로 불러올 수 있습니다.
      키는 서버 DB에 암호화해 저장하고 화면에는 끝 4자만 보입니다.</p>
  </section>;
}
