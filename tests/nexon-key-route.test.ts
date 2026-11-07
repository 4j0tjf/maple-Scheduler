import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { issueToken, SESSION_COOKIE } from "../src/services/accounts";
import { decryptKey } from "../src/services/key-encryption";

test("authenticated key routes isolate A/B, reject anonymous/cross-site writes and never return plaintext", async () => {
  process.env.NEXON_KEY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const rows = new Map(["a", "b"].map(id => [id, { id, username: id, passwordHash: `hash-${id}`, nexonApiKey: null as string | null }]));
  const bridge = globalThis as typeof globalThis & { __keyTestDb?: unknown };
  bridge.__keyTestDb = { account: {
    async findUnique({ where }: { where: { id: string } }) { return rows.get(where.id) ?? null; },
    async update({ where, data }: { where: { id: string }; data: { nexonApiKey: string | null } }) {
      const row = rows.get(where.id); assert.ok(row); Object.assign(row, data); return row;
    },
  } };
  const bundled = await build({ entryPoints: ["src/app/api/nexon-key/route.ts"], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "test-db", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const prisma = globalThis.__keyTestDb;" }));
    } }],
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(path.resolve("package.json")), loaded, loaded.exports);
  const routes = loaded.exports as Record<string, (request: Request) => Promise<Response>>;
  const originalFetch = globalThis.fetch; const usedKeys: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    usedKeys.push((init?.headers as Record<string, string>)["x-nxopen-api-key"]);
    return Response.json({ error: { name: "OPENAPI00004" } }, { status: 400 });
  }) as typeof fetch;
  const a = `test_${"a".repeat(40)}`, b = `test_${"b".repeat(40)}`;
  async function request(method: string, id?: string, body?: object, origin = "http://localhost") {
    const headers: Record<string, string> = { host: "localhost", origin, "content-type": "application/json" };
    if (id) headers.cookie = `${SESSION_COOKIE}=${issueToken(id, `hash-${id}`).token}`;
    return routes[method](new Request("http://localhost/scheduler/api/nexon-key", { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  }
  try {
    assert.equal((await request("GET")).status, 401);
    assert.equal((await request("PUT", undefined, { key: a })).status, 401);
    assert.equal((await request("PUT", "a", { key: a }, "https://foreign.example")).status, 403);
    const saved = await request("PUT", "a", { key: a, accountId: "b" }); assert.equal(saved.status, 200);
    assert.ok(!(await saved.text()).includes(a)); assert.equal(rows.get("b")!.nexonApiKey, null);
    assert.equal((await request("PUT", "b", { key: b })).status, 200);
    assert.equal(decryptKey(rows.get("a")!.nexonApiKey!, "a"), a);
    assert.equal(decryptKey(rows.get("b")!.nexonApiKey!, "b"), b);
    assert.equal((await (await request("GET", "a")).json()).hint, "test_••••aaaa");
    // 실 라우트/세션/복호화를 사용하고 DB와 넥슨 전송만 대체한다.
    (bridge.__keyTestDb as { character?: unknown }).character = {
      async findFirst({ where }: { where: { id: string; accountId: string } }) {
        return where.id === `character-${where.accountId}` ? { id: where.id, name: "SameCharacter" } : null;
      },
    };
    const ratesBundle = await build({ entryPoints: ["src/app/api/rates/route.ts"], bundle: true, write: false, platform: "node", format: "cjs",
      plugins: [{ name: "test-db", setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "db", namespace: "test" }));
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "noop", namespace: "test" }));
        builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "db" ? "export const prisma = globalThis.__keyTestDb;" : "" }));
      } }],
    });
    const ratesModule = { exports: {} };
    new Function("require", "module", "exports", ratesBundle.outputFiles[0].text)(createRequire(path.resolve("package.json")), ratesModule, ratesModule.exports);
    const rates = ratesModule.exports as { GET(request: Request): Promise<Response> };
    let levelA = 250;
    globalThis.fetch = (async (url, init) => {
      const key = (init?.headers as Record<string, string>)["x-nxopen-api-key"];
      if (String(url).includes("/id?")) return Response.json({ ocid: "same-ocid" });
      return Response.json({ character_level: key === a ? levelA : 280, character_class: "test" });
    }) as typeof fetch;
    const readRates = (id: string, character = `character-${id}`) => rates.GET(new Request("http://localhost/scheduler/api/rates", {
      headers: { cookie: `${SESSION_COOKIE}=${issueToken(id, `hash-${id}`).token}`, "x-character": character },
    }));
    assert.equal((await (await readRates("a")).json()).level, 250);
    assert.equal((await (await readRates("b")).json()).level, 280, "same character name must not share account cache");
    assert.equal((await readRates("a", "character-b")).status, 401, "another account's character is forbidden");
    levelA = 251;
    assert.equal((await request("PUT", "a", { key: a })).status, 200);
    assert.equal((await (await readRates("a")).json()).level, 251, "replacement must invalidate cache across route bundles");
    globalThis.fetch = (async (_url, init) => {
      usedKeys.push((init?.headers as Record<string, string>)["x-nxopen-api-key"]);
      return Response.json({ error: { name: "OPENAPI00004" } }, { status: 400 });
    }) as typeof fetch;
    assert.equal((await request("POST", "b")).status, 200); assert.equal(usedKeys.at(-1), b);
    assert.equal((await request("DELETE", "a")).status, 200);
    assert.equal(rows.get("a")!.nexonApiKey, null); assert.ok(rows.get("b")!.nexonApiKey);
    assert.equal((await readRates("a")).status, 409, "deleted key must not serve cached rates");
    assert.equal((await request("POST", "a")).status, 409);
    assert.deepEqual((await (await request("GET", "a")).json()), { registered: false, hint: null, health: null });
  } finally { globalThis.fetch = originalFetch; delete bridge.__keyTestDb; }
});
