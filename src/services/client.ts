import { apiUrl } from "@/base-path";
import { koreaDay, type Hunt } from "./domain";
import { EMPTY_PLAN, mapKey, type Plan } from "./efficiency";
import { EMPTY_SETUP, readSetup, type RateSetup } from "./rates";

export type Account = { id: string; username: string };
/** 계정에 등록한 캐릭터. 이미지·레벨·직업·월드는 넥슨 API에서 받아 둔 값이라 없을 수 있다. */
export type CharacterView = { id: string; name: string; level: number | null; className: string | null; world: string | null; image: string | null;
  memo: string; position: number; syncedAt: string | null };
/** 사냥 기록에서 고른 캐릭터. 기록 API는 이 캐릭터 id를 X-Character 헤더로 보낸다. */
export type HuntCharacter = { id: string; name: string };
/** 서버가 돌려준 기록. auctionPrice는 그날 경매장 평균가, evidence는 증거 이미지 수. */
export type HuntRow = Hunt & { auctionPrice?: string | null; evidence?: number; pending?: boolean };
type Outbox = Record<string, { characterId: string; hunt: Hunt }>;

// 사냥 기록(/hunting)과 같은 도메인이라 저장소를 같이 본다. 기록·대기열은 서로 섞이면 안 되므로 이름을 따로 쓴다.
const OUTBOX = "maple-scheduler-outbox-v1";
const PRICE = "maple-hunting-manual-price-v1";
const CHARACTER = "maple-scheduler-hunt-character-v1";

export class ApiError extends Error { constructor(message: string, readonly status: number, readonly data: unknown) { super(message); } }
/** 같은 사이트 API 호출. 로그인은 쿠키로 하고, 사냥 기록 API에는 고른 캐릭터를 X-Character로 붙인다. */
export async function api<T>(path: string, character: string | null = null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(character ? { "X-Character": character } : {}) };
  if (typeof init.body === "string") headers["Content-Type"] = "application/json";
  const response = await fetch(apiUrl(path), { ...init, credentials: "same-origin", headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const data = response.headers.get("content-type")?.includes("json") ? await response.json().catch(() => null) : null;
  if (!response.ok) throw new ApiError((data as { error?: string } | null)?.error ?? `요청 실패 (${response.status})`, response.status, data);
  return data as T;
}
export const errorText = (error: unknown, fallback = "요청 실패") => error instanceof Error ? error.message : fallback;

/** 서버에 아직 못 올린 기록. 네트워크가 끊기거나 창을 닫아도 다음에 이어서 올린다. */
export function readOutbox(): Outbox {
  try { return JSON.parse(localStorage.getItem(OUTBOX) ?? "{}") as Outbox; } catch { return {}; }
}
export function writeOutbox(box: Outbox) { localStorage.setItem(OUTBOX, JSON.stringify(box)); }

/** 사냥 기록에서 마지막으로 고른 캐릭터(이 브라우저). */
export function loadHuntCharacter(): string | null { try { return localStorage.getItem(CHARACTER); } catch { return null; } }
export function storeHuntCharacter(id: string | null) {
  try { if (id) localStorage.setItem(CHARACTER, id); else localStorage.removeItem(CHARACTER); } catch { /* 이번 화면에서만 기억 */ }
}

/** 경매장 시세가 없던 날 직접 넣은 조각 가격. 그날만 쓴다. */
export function loadManualPrice(now = Date.now()): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PRICE) ?? "null") as { day: string; price: string } | null;
    return saved?.day === koreaDay(now) ? saved.price : null;
  } catch { return null; }
}
export function storeManualPrice(price: string, now = Date.now()) {
  try { localStorage.setItem(PRICE, JSON.stringify({ day: koreaDay(now), price })); } catch { /* 이번 화면에서만 쓴다 */ }
}

/**
 * 기대 메소 계산 설정. 캐릭터별 공통값(레벨)과 메획·아획 출처별 설정(setup), 사냥터별 값(몬스터 레벨·몹 수)을 이 브라우저에 둔다.
 * 사냥 기록에는 시작할 때의 값이 함께 저장되므로 다른 기기에서도 기대값·손실률이 보인다.
 */
const PLAN = "maple-scheduler-plan-v1";
export type MapPreset = Pick<Plan, "map" | "mapId" | "mapVersion" | "monsterLevel" | "basis" | "mobCount" | "kills6m">;
export type PlanStore = { settings: Pick<Plan, "characterLevel" | "mesoRate" | "dropRate" | "levelFactor" | "source">; maps: Record<string, MapPreset>; lastMap: string | null;
  setup?: RateSetup };
export function loadPlanStore(characterId: string): PlanStore {
  try {
    const all = JSON.parse(localStorage.getItem(PLAN) ?? "{}") as Record<string, PlanStore>;
    const saved = all[characterId];
    if (saved) return { settings: { ...pickSettings(EMPTY_PLAN), ...saved.settings }, maps: saved.maps ?? {}, lastMap: saved.lastMap ?? null, setup: readSetup(saved.setup) };
  } catch { /* 처음 쓰는 것으로 본다 */ }
  return { settings: pickSettings(EMPTY_PLAN), maps: {}, lastMap: null, setup: EMPTY_SETUP };
}
export function storePlanStore(characterId: string, store: PlanStore) {
  try {
    const all = JSON.parse(localStorage.getItem(PLAN) ?? "{}") as Record<string, PlanStore>;
    localStorage.setItem(PLAN, JSON.stringify({ ...all, [characterId]: store }));
  } catch { /* 이번 화면에서만 쓴다 */ }
}
const pickSettings = (plan: Plan): PlanStore["settings"] =>
  ({ characterLevel: plan.characterLevel, mesoRate: plan.mesoRate, dropRate: plan.dropRate, levelFactor: plan.levelFactor, source: plan.source });
/** 저장된 설정과 사냥터 값을 합친 지금의 계산 조건. */
export function planFrom(store: PlanStore, map: string | null): Plan {
  const name = map ?? store.lastMap;
  const preset = store.maps[mapKey(name)];
  return { ...EMPTY_PLAN, ...store.settings, ...(preset ?? {}), map: name ?? preset?.map ?? null };
}
/** 계산 조건을 고치면 캐릭터 공통값과 그 사냥터 값으로 나눠 저장한다. */
export function rememberPlan(store: PlanStore, plan: Plan): PlanStore {
  const preset: MapPreset = { map: plan.map, mapId: plan.mapId, mapVersion: plan.mapVersion, monsterLevel: plan.monsterLevel, basis: plan.basis, mobCount: plan.mobCount, kills6m: plan.kills6m };
  return { ...store, settings: pickSettings(plan), maps: { ...store.maps, [mapKey(plan.map)]: preset }, lastMap: plan.map };
}
