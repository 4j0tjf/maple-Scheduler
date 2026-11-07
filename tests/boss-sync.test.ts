import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { bossRows, type BossState } from "../src/services/boss-plan";

test("신규 등록 동기화: 과거 목록은 DB에 유지하지만 과거 클리어·스냅샷은 현재 기록으로 저장하지 않는다", async () => {
  const now = Date.parse("2026-11-07T12:00:00+09:00");
  const stored: { bossState: BossState | null; activeDay: string | null } = { bossState: null, activeDay: null };
  const apiClears: unknown[] = [];
  const bridge = globalThis as typeof globalThis & { __bossSyncDb?: unknown };
  bridge.__bossSyncDb = {
    character: {
      async findUnique() { return stored; },
      async update({ data }: { data: Partial<typeof stored> }) { Object.assign(stored, data); return stored; },
    },
    bossSnapshot: { async findMany() { return []; } },
    bossClear: { async deleteMany() {}, async upsert(args: unknown) { apiClears.push(args); } },
    bossSetting: { async findMany() { return []; } },
  };
  const bundle = await build({ entryPoints: ["src/services/character-sync.ts"], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{
    name: "sync-db", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "noop", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "db" ? "export const prisma = globalThis.__bossSyncDb;" : "" }));
    },
  }] });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(path.resolve("package.json")), loaded, loaded.exports);
  type Row = { id: string; name: string; ocid: string; syncedAt: Date; bossSyncedAt: Date | null };
  const sync = (loaded.exports as { syncCharacter(row: Row, key: string, force: boolean, now: number): Promise<string | null> }).syncCharacter;
  const original = globalThis.fetch; const requested: string[] = [];
  const content = { content_name: "루시드", difficulty: "hard", cycle: "bossWeekly", registration_flag: "true", complete_flag: "true" };
  let currentFull = false;
  globalThis.fetch = (async url => {
    const address = new URL(String(url)); requested.push(address.searchParams.get("date") ?? "current");
    return Response.json({ boss_contents: address.searchParams.has("date") || currentFull
      ? [content, { cycle: "bossDaily" }] : [] });
  }) as typeof fetch;
  const row = { id: "new-character", name: "캐릭터", ocid: "ocid", syncedAt: new Date(now), bossSyncedAt: null };
  try {
    assert.equal(await sync(row, "test_registration_sync", false, now), null);
    assert.deepEqual(requested, ["current", "2026-11-06"]);
    assert.ok(stored.bossState?.registrationFallback);
    const rows = bossRows(stored.bossState, {}, {}, now);
    assert.equal(rows.length, 1); assert.equal(rows[0].boss.key, "lucid"); assert.equal(rows[0].cleared, false);
    assert.equal(apiClears.length, 0);
    currentFull = true;
    assert.equal(await sync(row, "test_registration_sync", false, now + 6 * 60_000), null);
    assert.equal(stored.bossState?.registrationFallback, undefined);
    assert.equal(apiClears.length, 1, "현재 정상 응답에서만 API 처치를 저장한다");
  } finally { globalThis.fetch = original; delete bridge.__bossSyncDb; }
});
