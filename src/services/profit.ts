import { weekStart } from "./period";

/**
 * 사냥 수익 집계. 사냥 기록에서 자동으로 계산한다.
 * 수익 = 획득 메소 + 조각 환산(획득 조각 × 사냥 시작일의 경매장 평균가, 없으면 그 기록에 직접 넣은 가격).
 */
export type ProfitRecord = {
  id: string; characterId: string; day: string; startedAt: number; endedAt: number | null; status: string;
  meso: number | null; fragments: number | null; auctionPrice: string | null; manualPrice: string | null; map: string | null; potions: number;
};
export type Grain = "day" | "week" | "month";
export type Bucket = { key: string; hunts: number; ms: number; meso: number; fragments: number; fragmentValue: number; profit: number;
  /** 수익을 계산한 기록 수(메소·조각을 하나도 못 읽은 기록은 빠진다). */
  counted: number; unpriced: number };

export const priceOf = (record: ProfitRecord) => record.auctionPrice ?? record.manualPrice ?? null;
export function valueOf(record: ProfitRecord) {
  const price = priceOf(record);
  const fragmentValue = record.fragments != null && price && /^\d+$/.test(price) ? record.fragments * Number(price) : null;
  const profit = record.meso == null && fragmentValue == null ? null : (record.meso ?? 0) + (fragmentValue ?? 0);
  return { fragmentValue, profit, unpriced: record.fragments != null && record.fragments > 0 && fragmentValue == null };
}
export const elapsedOf = (record: ProfitRecord) => Math.max(0, (record.endedAt ?? record.startedAt) - record.startedAt);
/** 묶음 key. 일: 사냥 시작 한국 날짜 · 주: 그 주 목요일(주간 보스와 같은 주) · 월: YYYY-MM. */
export function bucketKey(record: Pick<ProfitRecord, "day" | "startedAt">, grain: Grain) {
  return grain === "day" ? record.day : grain === "week" ? weekStart(record.startedAt) : record.day.slice(0, 7);
}
export const emptyBucket = (key: string): Bucket => ({ key, hunts: 0, ms: 0, meso: 0, fragments: 0, fragmentValue: 0, profit: 0, counted: 0, unpriced: 0 });
export function add(bucket: Bucket, record: ProfitRecord) {
  const value = valueOf(record);
  bucket.hunts++; bucket.ms += elapsedOf(record);
  bucket.meso += record.meso ?? 0; bucket.fragments += record.fragments ?? 0; bucket.fragmentValue += value.fragmentValue ?? 0;
  if (value.profit != null) { bucket.profit += value.profit; bucket.counted++; }
  if (value.unpriced) bucket.unpriced++;
  return bucket;
}
/** 기록을 일·주·월로 묶는다. 최근 묶음이 앞이다. */
export function summarize(records: ProfitRecord[], grain: Grain): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const record of records) { const key = bucketKey(record, grain); add(buckets.get(key) ?? buckets.set(key, emptyBucket(key)).get(key)!, record); }
  return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key));
}
export const total = (records: ProfitRecord[]) => records.reduce(add, emptyBucket("total"));
/** 시간당 수익. 10분 미만이면 흔들려서 보이지 않는다. */
export const hourly = (bucket: Bucket) => bucket.ms >= 10 * 60_000 ? bucket.profit * 3600_000 / bucket.ms : null;

const DAY = 24 * 3600_000;
/** from부터 to까지(포함) 한국 날짜 목록. 그래프에서 사냥하지 않은 날을 0으로 채울 때 쓴다. */
export function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= Date.parse(`${to}T00:00:00Z`) && days.length < 400; at += DAY) days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}
