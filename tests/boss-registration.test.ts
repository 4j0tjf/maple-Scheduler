import test from "node:test";
import assert from "node:assert/strict";
import { recoverRegistrations } from "../src/services/boss-registration";
import { bossRows, bossTotals, readSchedulerState, settleState, type BossState } from "../src/services/boss-plan";
import { NexonError } from "../src/services/nexon";
import { pastDays } from "../src/services/period";
const at = (text: string) => Date.parse(`${text}+09:00`);
const now = at("2026-11-07T12:00:00");
function full(time: number, name = "루시드"): BossState {
  return readSchedulerState({ boss_contents: [
    { content_name: name, difficulty: "hard", cycle: "bossWeekly", registration_flag: "true", complete_flag: "true" },
    { content_name: "윌", difficulty: "normal", cycle: "bossWeekly", registration_flag: "false", complete_flag: "true" },
    { content_name: "검은 마법사", difficulty: "hard", cycle: "bossMonthly", registration_flag: "true", complete_flag: "true" },
  ], weekly_boss_clear_count: 12 }, time);
}
const noLookup = async (): Promise<BossState> => { throw new Error("history should not be fetched"); };

test("기존 목록은 주·월 초기화와 축약 응답이 반복돼도 유지하고 이전 처치는 복사하지 않는다", async () => {
  const previous = full(at("2026-10-31T23:00:00"));
  const raw = readSchedulerState({}, now);
  const result = await recoverRegistrations(raw, previous, [], noLookup);
  assert.equal(result.weeklyStale, true); assert.equal(result.registrationFallback?.fetchedAt, previous.fetchedAt);
  assert.equal(result.weeklyCount, raw.weeklyCount); assert.equal(result.loggedIn, raw.loggedIn);
  assert.deepEqual(result.bosses, raw.bosses);
  const settled = settleState(result, { weekly: "stale", monthly: "stale" });
  const rows = bossRows(settled, {}, {}, now);
  assert.deepEqual(rows.map(row => row.boss.key).sort(), ["black_mage", "lucid"]);
  assert.ok(rows.every(row => !row.cleared && row.registered));
  assert.equal(bossTotals(rows).weekly.cleared, 0); assert.ok(bossTotals(rows).weekly.planned > 0);
  const again = await recoverRegistrations(readSchedulerState({}, now + 3600_000), settled, [], noLookup);
  assert.deepEqual(again.registrationFallback, result.registrationFallback);
});

test("신규 캐릭터도 DB 저장본 없이 최근 13일의 최신 정상 목록을 찾아 복원한다", async () => {
  const asked: string[] = [];
  const history = full(at("2026-11-04T23:59:59"));
  const result = await recoverRegistrations(readSchedulerState({}, now), null, [], async date => {
    asked.push(date);
    return date === "2026-11-04" ? history : readSchedulerState({}, at(`${date}T23:59:59`));
  });
  assert.deepEqual(asked, ["2026-11-06", "2026-11-05", "2026-11-04"]);
  assert.equal(result.registrationFallback?.fetchedAt, history.fetchedAt);
  assert.ok(bossRows(result, {}, {}, now).every(row => !row.cleared));
});

test("DB 과거 스냅샷 중 최신 목록을 재사용하고 숨김·직접 체크는 그대로 적용한다", async () => {
  const raw = readSchedulerState({}, now);
  const result = await recoverRegistrations(raw, full(at("2026-11-02T12:00:00")), [
    { date: "2026-11-05", state: full(at("2026-11-05T23:59:59")) },
  ], noLookup);
  assert.equal(result.registrationFallback?.fetchedAt, at("2026-11-05T23:59:59"));
  const rows = bossRows(result, { black_mage: { hidden: true, added: false, difficulty: null, partySize: 1 } }, {
    lucid: { period: "2026-11-05", difficulty: "hard", partySize: 2, price: 1000, source: "manual" },
  }, now);
  assert.deepEqual(rows.map(row => row.boss.key), ["lucid"]);
  assert.equal(rows[0].cleared, true); assert.equal(rows[0].clearSource, "manual"); assert.equal(rows[0].share, 500);
});

test("새 정상 응답이 오면 과거 목록을 버리고 게임에서 등록 해제한 보스를 다시 살리지 않는다", async () => {
  const old = await recoverRegistrations(readSchedulerState({}, now), full(now - 86400_000), [], noLookup);
  const fresh = full(now + 1000, "듄켈");
  const result = await recoverRegistrations(fresh, old, [], noLookup);
  assert.equal(result, fresh); assert.equal(result.registrationFallback, undefined);
  assert.ok(!bossRows(result, {}, {}, now + 1000).some(row => row.boss.key === "lucid"));
});

test("13일에도 목록이 없으면 만들지 않고 당일 반복 조회만 피하며 다음 날 다시 찾는다", async () => {
  let calls = 0;
  const lookup = async (date: string) => { calls++; return readSchedulerState({}, at(`${date}T23:59:59`)); };
  const raw = readSchedulerState({}, now);
  const result = await recoverRegistrations(raw, null, [], lookup);
  assert.equal(calls, 13); assert.deepEqual(bossRows(result, {}, {}, now), []);
  await recoverRegistrations(raw, result, [], noLookup);
  const retried = await recoverRegistrations(raw, result, [], async () => full(now - 1000), true);
  assert.ok(retried.registrationFallback, "직접 새로고침하면 당일에도 과거 기록을 다시 조회한다");
  await recoverRegistrations(readSchedulerState({}, now + 86400_000), result, [], lookup);
  assert.equal(calls, 26);
  const latest = full(now - 1000);
  const backfilled = await recoverRegistrations(raw, result, [{ date: "2026-11-06", state: latest }], noLookup);
  assert.ok(backfilled.registrationFallback, "백필로 목록이 생기면 당일에도 복구한다");
});

test("어제 결산 중이면 더 이전 날짜를 찾고 네트워크 오류는 당일 재시도를 막지 않는다", async () => {
  const days = pastDays(now).reverse(); const raw = readSchedulerState({}, now);
  const result = await recoverRegistrations(raw, null, [], async date => {
    if (date === days[0]) throw new NexonError("OPENAPI00009", 400);
    return full(at(`${date}T23:59:59`));
  });
  assert.equal(result.registrationFallback?.fetchedAt, at(`${days[1]}T23:59:59`));
  const failed = await recoverRegistrations(raw, null, [], async () => { throw new Error("network"); });
  assert.equal(failed.registrationCheckedDay, undefined);
});
