import test from "node:test";
import assert from "node:assert/strict";
import { BOSSES, bossKeyOfName, findBoss, levelOf, maxPartyOf, shareOf } from "../src/data/bosses";
import { bossRows, bossTotals, hiddenBosses, readSchedulerState, type BossState } from "../src/services/boss-plan";
import { monthStart, nextReset, periodOf, weekLabel, weekStart } from "../src/services/period";
import { bucketKey, daysBetween, hourly, summarize, total, valueOf, type ProfitRecord } from "../src/services/profit";

const kst = (text: string) => Date.parse(`${text}+09:00`);

test("weekly bosses reset on Thursday 00:00 KST and monthly bosses on the 1st", () => {
  // 2026-10-01은 목요일이다.
  assert.equal(weekStart(kst("2026-10-01T00:00:00")), "2026-10-01");
  assert.equal(weekStart(kst("2026-09-30T23:59:59")), "2026-09-24");
  assert.equal(weekStart(kst("2026-10-07T23:59:59")), "2026-10-01");
  assert.equal(weekStart(kst("2026-10-08T00:00:00")), "2026-10-08");
  // UTC로는 아직 수요일이지만 한국은 목요일 0시가 지났다.
  assert.equal(weekStart(Date.parse("2026-09-30T15:00:00Z")), "2026-10-01");
  assert.equal(monthStart(kst("2026-10-31T23:59:59")), "2026-10-01");
  assert.equal(monthStart(Date.parse("2026-09-30T15:00:00Z")), "2026-10-01");
  assert.equal(periodOf("monthly", kst("2026-10-03T12:00:00")), "2026-10-01");
  assert.equal(nextReset("weekly", kst("2026-10-03T12:00:00")), kst("2026-10-08T00:00:00"));
  assert.equal(nextReset("monthly", kst("2026-12-15T12:00:00")), kst("2027-01-01T00:00:00"));
  assert.equal(weekLabel("2026-10-01"), "10/1(목) ~ 10/7(수)");
});

test("boss catalog is consistent and matches Nexon names regardless of spacing", () => {
  const keys = new Set(BOSSES.map(boss => boss.key)); assert.equal(keys.size, BOSSES.length);
  for (const boss of BOSSES) {
    assert.ok(boss.levels.length > 0, boss.key);
    for (const level of boss.levels) assert.ok(Number.isSafeInteger(level.price) && level.price > 0, `${boss.key} ${level.difficulty}`);
    assert.equal(new Set(boss.levels.map(level => level.difficulty)).size, boss.levels.length, `${boss.key} duplicate difficulty`);
  }
  assert.equal(bossKeyOfName("진힐라"), "verus_hilla"); assert.equal(bossKeyOfName("진 힐라"), "verus_hilla");
  assert.equal(bossKeyOfName("검은 마법사"), "black_mage"); assert.equal(bossKeyOfName("블러디퀸"), "crimson_queen");
  assert.equal(bossKeyOfName("가디언 엔젤 슬라임"), "guardian_angel_slime"); assert.equal(bossKeyOfName("없는 보스"), null);
  // 2026-09-17 패치 가격 몇 가지.
  assert.equal(levelOf(findBoss("zakum")!, "chaos")!.price, 4_040_000);
  assert.equal(levelOf(findBoss("guardian_kalos")!, "normal")!.price, 479_000_000);
  assert.equal(levelOf(findBoss("black_mage")!, "extreme")!.price, 5_680_000_000);
  assert.equal(maxPartyOf(findBoss("lotus")!, "extreme"), 2); assert.equal(maxPartyOf(findBoss("lotus")!, "hard"), 6);
  assert.equal(maxPartyOf(findBoss("limbo")!, "normal"), 3);
  assert.equal(shareOf(4_040_000, 3), 1_346_666); assert.equal(shareOf(100, 0), 100);
});

const NOW = kst("2026-10-03T12:00:00");
function wire(entries: [string, string, string, boolean, boolean][]) {
  return { boss_contents: entries.map(([name, difficulty, cycle, registered, complete]) =>
    ({ content_name: name, difficulty, cycle, registration_flag: String(registered), complete_flag: String(complete) })), weekly_boss_clear_count: 1, weekly_boss_clear_limit_count: 12 };
}

test("scheduler response keeps weekly and monthly bosses, drops daily ones and reads string flags", () => {
  const state = readSchedulerState(wire([["자쿰", "chaos", "bossWeekly", true, true], ["힐라", "hard", "bossDaily", true, true],
    ["검은 마법사", "extreme", "bossMonthly", false, false], ["새 보스", "normal", "bossWeekly", true, false]]), NOW);
  assert.equal(state.bosses.length, 3); assert.equal(state.weeklyStale, false);
  assert.deepEqual(state.bosses[0], { boss: "zakum", name: "자쿰", difficulty: "chaos", cycle: "weekly", registered: true, complete: true });
  assert.equal(state.bosses[2].boss, null, "unknown bosses are kept but unmatched");
  assert.equal(state.weeklyCount, 1); assert.equal(state.weeklyLimit, 12);
  assert.equal(readSchedulerState(wire([["검은 마법사", "hard", "bossMonthly", false, false]]), NOW).weeklyStale, true, "abbreviated response");
  assert.equal(readSchedulerState({}, NOW).weeklyStale, true);
});

test("boss list merges game registration, clears and manual additions", () => {
  const state = readSchedulerState(wire([["루시드", "hard", "bossWeekly", true, false], ["윌", "normal", "bossWeekly", true, false],
    ["윌", "hard", "bossWeekly", false, true], ["듄켈", "hard", "bossWeekly", false, false]]), NOW);
  const rows = bossRows(state, { lucid: { difficulty: null, partySize: 2, added: false }, zakum: { difficulty: "chaos", partySize: 1, added: true } }, {}, NOW);
  const byKey = Object.fromEntries(rows.map(row => [row.boss.key, row]));
  assert.deepEqual(Object.keys(byKey).sort(), ["lucid", "will", "zakum"], "unregistered and uncleared bosses stay out");
  assert.equal(byKey.lucid.share, Math.floor(59_700_000 / 2)); assert.equal(byKey.lucid.cleared, false); assert.equal(byKey.lucid.registered, true);
  assert.equal(byKey.will.difficulty, "hard", "the difficulty actually cleared wins over the registered one");
  assert.equal(byKey.will.cleared, true); assert.equal(byKey.will.clearSource, "api");
  assert.equal(byKey.zakum.added, true);
  assert.deepEqual(rows.map(row => row.boss.key), ["zakum", "lucid", "will"], "list keeps the catalog (boss list) order");
  const totals = bossTotals(rows);
  assert.equal(totals.weekly.cleared, 73_200_000); assert.equal(totals.weekly.planned, 73_200_000 + 29_850_000 + 4_040_000);
  assert.equal(totals.weekly.clearedCount, 1); assert.equal(totals.weekly.count, 3);
});

test("completion from an earlier week is ignored, stored clears keep their price and stale responses fall back to settings", () => {
  const lastWeek = readSchedulerState(wire([["카링", "normal", "bossWeekly", true, true]]), kst("2026-09-30T12:00:00"));
  const [row] = bossRows(lastWeek, {}, {}, NOW);
  assert.equal(row.boss.key, "kaling"); assert.equal(row.cleared, false, "last week's clear does not count this week"); assert.equal(row.registered, true);
  const cleared = bossRows(null, {}, { kaling: { period: "2026-10-01", difficulty: "normal", partySize: 3, price: 678_000_000, source: "manual" } }, NOW)[0];
  assert.equal(cleared.price, 678_000_000, "price at clear time"); assert.equal(cleared.share, 226_000_000); assert.equal(cleared.clearSource, "manual");
  assert.equal(bossRows(null, {}, { kaling: { period: "2026-09-24", difficulty: "normal", partySize: 3, price: 1, source: "manual" } }, NOW).length, 0, "old period clear is ignored");
  const stale: BossState = { ...lastWeek, weeklyStale: true };
  assert.equal(bossRows(stale, {}, {}, NOW).length, 0);
  assert.equal(bossRows(stale, { kaling: { difficulty: "easy", partySize: 1, added: true } }, {}, NOW)[0].difficulty, "easy");
});

test("a deleted boss stays out while the game scheduler still lists it, and the hide lifts once the game drops it", () => {
  // 챌린저스 월드가 끝나도 넥슨 스케줄러에 남는 시즌 보스.
  const state = readSchedulerState(wire([["시즌 보스 메이린", "hard", "bossWeekly", true, false], ["루시드", "hard", "bossWeekly", true, false]]), NOW);
  assert.deepEqual(bossRows(state, {}, {}, NOW).map(row => row.boss.key), ["lucid", "meirin"]);
  const hidden = { meirin: { difficulty: null, partySize: 1, added: false, hidden: true } };
  const rows = bossRows(state, hidden, {}, NOW);
  assert.deepEqual(rows.map(row => row.boss.key), ["lucid"]);
  assert.equal(bossTotals(rows).weekly.planned, 59_700_000, "a deleted boss leaves expected income");
  assert.deepEqual(hiddenBosses(state, hidden, {}, NOW).map(boss => boss.key), ["meirin"], "still in the game scheduler, so it can be restored");
  const clear = { meirin: { period: "2026-10-01", difficulty: "hard", partySize: 1, price: 600_000_000, source: "api" as const } };
  assert.deepEqual(bossRows(state, hidden, clear, NOW).map(row => row.boss.key), ["lucid"], "even a clear this week does not bring it back");
  const dropped = readSchedulerState(wire([["루시드", "hard", "bossWeekly", true, false]]), NOW);
  assert.deepEqual(hiddenBosses(dropped, hidden, {}, NOW), [], "the game dropped it, so sync can lift the hide");
  assert.deepEqual(hiddenBosses(dropped, hidden, clear, NOW).map(boss => boss.key), ["meirin"], "a clear this week keeps the hide until the reset");
  assert.deepEqual(hiddenBosses(state, { lucid: { hidden: false } }, {}, NOW), []);
});

test("only twelve weekly bosses count toward expected income, cleared ones first; monthly bosses are separate", () => {
  const weekly = BOSSES.filter(boss => boss.cycle === "weekly").slice(0, 14);
  const settings = Object.fromEntries(weekly.map(boss => [boss.key, { difficulty: boss.levels[0].difficulty, partySize: 1, added: true }]));
  settings.black_mage = { difficulty: "hard", partySize: 1, added: true };
  const cheapest = weekly[0];
  const rows = bossRows(null, settings, { [cheapest.key]: { period: "2026-10-01", difficulty: cheapest.levels[0].difficulty, partySize: 1, price: cheapest.levels[0].price, source: "manual" } }, NOW);
  const over = rows.filter(row => row.overLimit);
  assert.equal(over.length, 2); assert.ok(!rows.find(row => row.boss.key === cheapest.key)!.overLimit, "a cleared boss always counts");
  const totals = bossTotals(rows);
  assert.equal(totals.weekly.count, 12); assert.equal(totals.monthly.planned, 465_000_000);
  assert.equal(rows.find(row => row.boss.key === "black_mage")!.period, "2026-10-01");
});

const record = (patch: Partial<ProfitRecord>): ProfitRecord => ({ id: "x", characterId: "c", day: "2026-10-03", startedAt: kst("2026-10-03T10:00:00"),
  endedAt: kst("2026-10-03T10:30:00"), status: "saved", meso: 100_000_000, fragments: 10, auctionPrice: "8000000", manualPrice: null, map: null, potions: 1, ...patch });

test("hunting profit adds meso and fragment value and groups by day, Thursday week and month", () => {
  assert.deepEqual(valueOf(record({})), { fragmentValue: 80_000_000, profit: 180_000_000, unpriced: false });
  assert.deepEqual(valueOf(record({ auctionPrice: null, manualPrice: "5000000" })).fragmentValue, 50_000_000);
  assert.deepEqual(valueOf(record({ auctionPrice: null })), { fragmentValue: null, profit: 100_000_000, unpriced: true });
  assert.equal(valueOf(record({ meso: null, fragments: null })).profit, null);
  assert.equal(bucketKey(record({}), "week"), "2026-10-01"); assert.equal(bucketKey(record({}), "month"), "2026-10");
  const rows = [record({ id: "a" }), record({ id: "b", day: "2026-09-30", startedAt: kst("2026-09-30T10:00:00"), endedAt: kst("2026-09-30T12:00:00") }),
    record({ id: "c", meso: null, fragments: null })];
  const weeks = summarize(rows, "week");
  assert.deepEqual(weeks.map(bucket => bucket.key), ["2026-10-01", "2026-09-24"]);
  assert.equal(weeks[0].hunts, 2); assert.equal(weeks[0].counted, 1); assert.equal(weeks[0].profit, 180_000_000);
  const all = total(rows); assert.equal(all.profit, 360_000_000); assert.equal(all.ms, 3 * 3600_000);
  assert.equal(hourly(all), 120_000_000); assert.equal(hourly(total([record({ endedAt: kst("2026-10-03T10:05:00") })])), null, "too short to rate");
  assert.deepEqual(daysBetween("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
});
