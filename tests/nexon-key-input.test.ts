import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { issueToken, SESSION_COOKIE } from "../src/services/accounts";
import { decryptKey } from "../src/services/key-encryption";
import { NEXON_KEY, readKeyInput } from "../src/services/nexon";

const KEY = `test_${"c0".repeat(32)}`;

test("붙여 넣은 키: .env 줄·따옴표·공백을 벗기고 키만 남긴다", () => {
  for (const pasted of [KEY, `  ${KEY}\n`, `"${KEY}"`, `'${KEY}'`, `NEXON_API_KEY="${KEY}"`, `NEXON_API_KEY = ${KEY}`, `export NEXON_API_KEY='${KEY}'`])
    assert.equal(readKeyInput(pasted), KEY, pasted);
  assert.equal(readKeyInput(null), "");
  assert.ok(!NEXON_KEY.test(`"${KEY}"`), "따옴표가 남은 키는 받지 않는다");
  assert.ok(!NEXON_KEY.test(`${KEY}'`));
  assert.ok(NEXON_KEY.test(KEY));
});

test("키 등록: 넥슨이 틀린 키라고 한 시도만 10회/10분으로 막고, 점검·연결 오류는 세지 않는다", async () => {
  process.env.NEXON_KEY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const row = { id: "a", username: "a", passwordHash: "hash-a", nexonApiKey: null as string | null };
  const bridge = globalThis as typeof globalThis & { __keyInputDb?: unknown };
  bridge.__keyInputDb = { account: {
    async findUnique() { return row; },
    async update({ data }: { data: { nexonApiKey: string | null } }) { Object.assign(row, data); return row; },
  } };
  const bundled = await build({ entryPoints: ["src/app/api/nexon-key/route.ts"], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "test-db", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const prisma = globalThis.__keyInputDb;" }));
    } }],
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(path.resolve("package.json")), loaded, loaded.exports);
  const { PUT } = loaded.exports as { PUT(request: Request): Promise<Response> };
  const put = (key: string) => PUT(new Request("http://localhost/scheduler/api/nexon-key", { method: "PUT", body: JSON.stringify({ key }),
    headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json", cookie: `${SESSION_COOKIE}=${issueToken("a", "hash-a").token}` } }));
  const sent: string[] = []; let nexonDown = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const key = (init?.headers as Record<string, string>)["x-nxopen-api-key"]; sent.push(key);
    if (nexonDown) return Response.json({ error: { name: "OPENAPI00011" } }, { status: 400 });
    return Response.json({ error: { name: key === KEY ? "OPENAPI00004" : "OPENAPI00005" } }, { status: 400 });
  }) as typeof fetch;
  try {
    nexonDown = true;
    for (let i = 0; i < 12; i++) assert.equal((await put(KEY)).status, 503, "점검 중에는 몇 번을 눌러도 잠기지 않는다");
    nexonDown = false;
    assert.equal((await put(`NEXON_API_KEY="${KEY}"`)).status, 200, ".env 줄을 그대로 넣어도 등록된다");
    assert.equal(sent.at(-1), KEY, "넥슨에는 따옴표 없이 키만 보낸다");
    assert.equal(decryptKey(row.nexonApiKey!, "a"), KEY);
    const wrong = `test_${"d1".repeat(32)}`;
    for (let i = 0; i < 10; i++) assert.equal((await put(wrong)).status, 400);
    const calls = sent.length;
    assert.equal((await put(KEY)).status, 429, "틀린 키 10번 뒤에는 10분간 막는다");
    assert.equal(sent.length, calls, "막힌 동안은 넥슨을 부르지 않는다");
  } finally { globalThis.fetch = original; delete bridge.__keyInputDb; }
});
