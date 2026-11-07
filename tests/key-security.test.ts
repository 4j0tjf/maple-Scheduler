import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptKey, encryptKey, encryptionKey } from "../src/services/key-encryption";
import { readAccountKey, saveAccountKey, type AccountKeyStore } from "../src/services/nexon-key-store";
import { ExpiringCache } from "../src/services/expiring-cache";
import { KeyRateQueue } from "../src/services/nexon-traffic";
import { mapLimited, singleFlight } from "../src/services/async-work";
import { ratesCache, ratesScope, invalidateAccountRates } from "../src/services/rates-cache";
import type { CharacterInfo } from "../src/services/nexon";
process.env.NEXON_KEY_ENCRYPTION_KEY = randomBytes(32).toString("hex");

test("AES-GCM: randomized encryption, account binding, tamper and wrong key rejection", () => {
  const a = encryptKey("secret-api-key", "a"), b = encryptKey("secret-api-key", "a");
  assert.notEqual(a, b); assert.ok(!a.includes("secret-api-key"));
  assert.equal(decryptKey(a, "a"), "secret-api-key");
  assert.throws(() => decryptKey(a, "b"));
  const parts = a.split(":"); parts[3] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => decryptKey(parts.join(":"), "a"));
  const original = process.env.NEXON_KEY_ENCRYPTION_KEY;
  process.env.NEXON_KEY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  assert.throws(() => decryptKey(a, "a"));
  delete process.env.NEXON_KEY_ENCRYPTION_KEY; assert.throws(encryptionKey);
  process.env.NEXON_KEY_ENCRYPTION_KEY = original;
});

test("key store isolates accounts through replace/delete and supports legacy conversion", async () => {
  const rows = new Map<string, string | null>([["a", "legacy-key"], ["b", null]]);
  const store: AccountKeyStore = {
    async findUnique({ where }) { return { nexonApiKey: rows.get(where.id) ?? null }; },
    async update({ where, data }) { rows.set(where.id, data.nexonApiKey); },
  };
  assert.equal(await readAccountKey(store, "a"), "legacy-key");
  await saveAccountKey(store, "a", "key-a"); await saveAccountKey(store, "b", "key-b");
  assert.equal(await readAccountKey(store, "a"), "key-a"); assert.equal(await readAccountKey(store, "b"), "key-b");
  await saveAccountKey(store, "a", "new-a"); await saveAccountKey(store, "a", null);
  assert.equal(await readAccountKey(store, "a"), null); assert.equal(await readAccountKey(store, "b"), "key-b");
  rows.set("a", rows.get("b")!); await assert.rejects(readAccountKey(store, "a"));
});

test("rate queue respects per-key windows and prioritizes waiting foreground over backfill", async () => {
  const queue = new KeyRateQueue(1, 35);
  await queue.take("a"); const order: string[] = [];
  const background = queue.take("a", true).then(() => order.push("background"));
  const foreground = queue.take("a").then(() => order.push("foreground"));
  await queue.take("b"); assert.deepEqual(order, []);
  await Promise.all([background, foreground]); assert.deepEqual(order, ["foreground", "background"]);
});

test("backfill concurrency is bounded and overlapping invocations share one run, including recovery", async () => {
  let active = 0, maximum = 0, calls = 0;
  const run = singleFlight(async () => {
    calls++;
    await mapLimited([1, 2, 3, 4, 5], 2, async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
    });
  });
  await Promise.all([run(), run(), run()]); assert.equal(calls, 1); assert.equal(maximum, 2);
  await run(); assert.equal(calls, 2);
  let tries = 0; const fail = singleFlight(async () => { if (!tries++) throw Error("failed"); return 1; });
  await assert.rejects(fail()); assert.equal(await fail(), 1);
});

test("cache expires, stays bounded and invalidates only the selected account and key", () => {
  const cache = new ExpiringCache<number>(10, 2);
  cache.set("a", 1, 0); cache.set("b", 2, 1); cache.set("c", 3, 2);
  assert.equal(cache.get("a", 3), undefined); assert.equal(cache.get("b", 11), undefined);
  const a = ratesScope("a", "character", "key1"), b = ratesScope("b", "character", "key1");
  ratesCache.set(a, { name: "A" } as CharacterInfo); ratesCache.set(b, { name: "B" } as CharacterInfo);
  assert.equal(ratesCache.get(ratesScope("a", "character", "key2")), undefined);
  invalidateAccountRates("a"); assert.equal(ratesCache.get(a), undefined); assert.equal(ratesCache.get(b)?.name, "B");
});

test("server key preparation preserves existing .env values even with an empty injected variable", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { createRequire } = await import("node:module");
  const require = createRequire(path.resolve("package.json"));
  const cwd = mkdtempSync(path.join(tmpdir(), "maple-key-prepare-"));
  const run = (key = "") => spawnSync(process.execPath, ["--require", require.resolve("tsx/cjs"), path.resolve("scripts/prepare-key-encryption.ts")], {
    cwd, env: { ...process.env, NEXON_KEY_ENCRYPTION_KEY: key }, encoding: "utf8",
  });
  try {
    writeFileSync(path.join(cwd, ".env"), '# existing settings\nMARKET_URL="http://localhost:3000"\nNEXON_KEY_ENCRYPTION_KEY=""\n');
    assert.equal(run().status, 0);
    const before = readFileSync(path.join(cwd, ".env"), "utf8");
    const key = /NEXON_KEY_ENCRYPTION_KEY="([a-f0-9]{64})"/.exec(before)![1];
    const again = run(); assert.equal(again.status, 0); assert.ok(!again.stdout.includes(key));
    assert.ok(readFileSync(path.join(cwd, ".env"), "utf8") === before, "existing key/settings must not change");
    assert.notEqual(run(randomBytes(32).toString("hex")).status, 0);
    assert.ok(readFileSync(path.join(cwd, ".env"), "utf8") === before, "conflicting environment must not overwrite key");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
