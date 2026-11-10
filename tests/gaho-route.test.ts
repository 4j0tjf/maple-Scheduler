import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { issueToken, SESSION_COOKIE } from "../src/services/accounts";
import { encryptKey } from "../src/services/key-encryption";
import { readGahoState, staleBase } from "../src/services/gaho";

/** 라우트를 묶되 DB(@/lib/prisma)와 server-only만 바꿔 끼운다. */
async function loadRoute(entry: string) {
  const bundled = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "test-db", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "noop", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "db" ? "export const prisma = globalThis.__gahoTestDb;" : "" }));
    } }],
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(path.resolve("package.json")), loaded, loaded.exports);
  return loaded.exports as Record<string, (request: Request) => Promise<Response>>;
}

function fakeDb() {
  const accounts = new Map(["a", "b"].map(id => [id, { id, username: id, passwordHash: `hash-${id}`, nexonApiKey: null as string | null }]));
  const states = new Map<string, { accountId: string; state: unknown; updatedAt: Date }>();
  let clock = Date.parse("2026-11-10T00:00:00Z");
  const db = {
    account: {
      async findUnique({ where }: { where: { id: string } }) { return accounts.get(where.id) ?? null; },
    },
    gahoState: {
      async findUnique({ where }: { where: { accountId: string } }) { return states.get(where.accountId) ?? null; },
      async upsert({ where, create, update }: { where: { accountId: string }; create: { accountId: string; state: unknown }; update: { state: unknown } }) {
        const row = { accountId: where.accountId, state: states.has(where.accountId) ? update.state : create.state, updatedAt: new Date(clock += 1000) };
        states.set(where.accountId, row); return row;
      },
    },
  };
  (globalThis as typeof globalThis & { __gahoTestDb?: unknown }).__gahoTestDb = db;
  return { accounts, states };
}

const cookie = (id: string) => `${SESSION_COOKIE}=${issueToken(id, `hash-${id}`).token}`;
const profile = (name: string, characters: unknown[] = []) => ({ id: name, name, coins: 1000, characters });

test("계산기 값은 크기와 큰 틀(넥슨 계정 탭 1~20개, 탭마다 캐릭터 60명)만 확인한다", () => {
  assert.ok(readGahoState({ version: 2, profiles: [profile("본계정", [{ name: "아델" }])] }));
  assert.equal(readGahoState(null), null);
  assert.equal(readGahoState({ profiles: [] }), null);
  assert.equal(readGahoState({ profiles: Array.from({ length: 21 }, (_, i) => profile(`${i}`)) }), null);
  assert.equal(readGahoState({ profiles: [profile("x", Array.from({ length: 61 }, () => ({})))] }), null);
  assert.equal(readGahoState({ profiles: [{ id: "x" }] }), null);
  assert.equal(readGahoState({ profiles: [profile("x", ["아델"])] }), null);
  const saved = new Date("2026-11-10T00:00:00Z");
  assert.equal(staleBase(null, null), false);
  assert.equal(staleBase(saved, saved.toISOString()), false);
  assert.equal(staleBase(saved, null), true);
  assert.equal(staleBase(saved, "2026-11-09T00:00:00.000Z"), true);
});

test("계산기 값은 로그인한 계정마다 따로 저장하고, 다른 곳에서 먼저 저장했으면 덮어쓰지 않는다", async () => {
  const { states } = fakeDb();
  const route = await loadRoute("src/app/api/gaho/route.ts");
  const call = (method: string, id?: string, body?: object, origin = "http://localhost") => {
    const headers: Record<string, string> = { host: "localhost", origin, "content-type": "application/json" };
    if (id) headers.cookie = cookie(id);
    return route[method](new Request("http://localhost/scheduler/api/gaho", { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  };
  const state = { version: 2, active: "본계정", profiles: [profile("본계정", [{ name: "아델", weekly: 1 }]), profile("부계정")] };

  assert.equal((await call("GET")).status, 401);
  assert.deepEqual(await (await call("GET", "a")).json(), { state: null, updatedAt: null });
  assert.equal((await call("PUT", undefined, { state, base: null })).status, 401);
  assert.equal((await call("PUT", "a", { state, base: null }, "https://foreign.example")).status, 403);
  assert.equal((await call("PUT", "a", { state: { profiles: "x" }, base: null })).status, 400);
  assert.equal((await call("PUT", "a", { state: { profiles: [profile("x")], pad: "x".repeat(300_000) }, base: null })).status, 400);

  const first = await call("PUT", "a", { state, base: null, accountId: "b" });
  assert.equal(first.status, 200);
  const { updatedAt } = await first.json() as { updatedAt: string };
  assert.ok(!states.has("b"), "다른 계정 id를 보내도 로그인한 계정에만 저장한다");
  assert.deepEqual(await (await call("GET", "a")).json(), { state, updatedAt });
  assert.deepEqual(await (await call("GET", "b")).json(), { state: null, updatedAt: null });

  // 오래 열어 둔 창(base가 옛 값)은 덮어쓰지 못하고 저장본을 받는다
  const changed = { ...state, profiles: [profile("본계정")] };
  const conflict = await call("PUT", "a", { state: changed, base: null });
  assert.equal(conflict.status, 409);
  assert.deepEqual((await conflict.json() as { state: unknown }).state, state);
  const next = await call("PUT", "a", { state: changed, base: updatedAt });
  assert.equal(next.status, 200);
  assert.deepEqual((await (await call("GET", "a")).json() as { state: unknown }).state, changed);
});

test("캐릭터 조회는 그 계정의 넥슨 키로 하고, 스케줄러에 등록하지 않으며, 같은 이름은 한 시간 저장본을 쓴다", async () => {
  process.env.NEXON_KEY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { accounts } = fakeDb();
  const keyA = `test_${"a".repeat(40)}`;
  accounts.get("a")!.nexonApiKey = encryptKey(keyA, "a");
  const route = await loadRoute("src/app/api/gaho/character/route.ts");
  const originalFetch = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async (url, init) => {
    const target = String(url); calls.push(`${(init?.headers as Record<string, string>)["x-nxopen-api-key"]} ${target.replace(/^.*\/v1/, "")}`);
    if (target.includes("/id?")) {
      return decodeURIComponent(target).includes("없는캐릭") ? Response.json({ error: { name: "OPENAPI00004" } }, { status: 400 }) : Response.json({ ocid: "ocid-1" });
    }
    return Response.json({ character_name: "아델본캐", character_level: 285, character_class: "아델", world_name: "스카니아",
      character_image: "https://open.api.nexon.com/static/maplestory/character/look/A" });
  }) as typeof fetch;
  const lookup = (name: string, id?: string) => route.GET(new Request(`http://localhost/scheduler/api/gaho/character?name=${encodeURIComponent(name)}`,
    { headers: { host: "localhost", ...(id ? { cookie: cookie(id) } : {}) } }));
  try {
    assert.equal((await lookup("아델본캐")).status, 401);
    assert.equal((await lookup("a", "a")).status, 400);
    assert.equal((await lookup("아델본캐", "b")).status, 409, "키가 없는 계정");
    const found = await lookup("아델 본캐", "a");
    assert.equal(found.status, 200);
    assert.deepEqual(await found.json(), { name: "아델본캐", image: "https://open.api.nexon.com/static/maplestory/character/look/A", level: 285, job: "아델", world: "스카니아" });
    assert.ok(calls.every(call => call.startsWith(keyA)), "그 계정의 키로만 부른다");
    const before = calls.length;
    assert.equal((await lookup("아델본캐", "a")).status, 200);
    assert.equal(calls.length, before, "저장본");
    assert.equal((await lookup("없는캐릭", "a")).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});
