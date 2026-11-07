import test from "node:test";
import assert from "node:assert/strict";
import { keyAccepted, keyHint, NEXON_KEY, nexonGet } from "../src/services/nexon";

/** 넥슨 응답을 흉내 낸다. 호출마다 받은 키를 남긴다. */
function fakeNexon(reply: (key: string) => { status: number; body: unknown }) {
  const keys: string[] = []; const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const key = (init?.headers as Record<string, string>)["x-nxopen-api-key"]; keys.push(key);
    const { status, body } = reply(key);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { keys, restore: () => { globalThis.fetch = original; } };
}

test("넥슨 API 키 형식: 공백 없는 16~200자만 받는다", () => {
  assert.ok(NEXON_KEY.test(`test_${"a1".repeat(32)}`));
  assert.ok(NEXON_KEY.test(`live_${"f0".repeat(32)}`));
  assert.ok(!NEXON_KEY.test("short"));
  assert.ok(!NEXON_KEY.test(`test_${"a".repeat(20)} x`));
  assert.ok(!NEXON_KEY.test(`test_${"a".repeat(20)}\n`));
  assert.ok(!NEXON_KEY.test("가".repeat(20)));
});

test("화면에는 키 앞머리와 끝 4자만 보인다", () => {
  const key = `test_${"0".repeat(60)}ab12`;
  assert.equal(keyHint(key), "test_••••ab12");
  assert.equal(keyHint(`live_${"9".repeat(60)}zz99`), "live_••••zz99");
  assert.equal(keyHint(`${"x".repeat(30)}9876`), "••••9876");
  assert.ok(!keyHint(key).includes("0000"));
});

test("키 확인: 캐릭터가 없어도 키가 맞으면 통과, 키가 틀리면 false, 점검이면 던진다", async () => {
  const good = `test_${"1".repeat(40)}`; const bad = `test_${"2".repeat(40)}`; const down = `test_${"3".repeat(40)}`;
  const nexon = fakeNexon(key => key === good ? { status: 400, body: { error: { name: "OPENAPI00004" } } }
    : key === bad ? { status: 400, body: { error: { name: "OPENAPI00005" } } } : { status: 400, body: { error: { name: "OPENAPI00011" } } });
  try {
    assert.equal(await keyAccepted(good), true);
    assert.equal(await keyAccepted(bad), false);
    await assert.rejects(keyAccepted(down));
  } finally { nexon.restore(); }
});

test("호출 한도는 키마다 따로 센다: 한 키가 초당 한도를 채워도 다른 키는 기다리지 않는다", async () => {
  const busy = `test_${"4".repeat(40)}`; const other = `test_${"5".repeat(40)}`;
  const nexon = fakeNexon(() => ({ status: 200, body: { ocid: "x" } }));
  try {
    await Promise.all(Array.from({ length: 5 }, () => nexonGet("/id?character_name=a", busy)));
    const started = Date.now();
    await nexonGet("/id?character_name=b", other);
    assert.ok(Date.now() - started < 300, "다른 키는 바로 불린다");
    assert.deepEqual(nexon.keys, [busy, busy, busy, busy, busy, other]);
  } finally { nexon.restore(); }
});
