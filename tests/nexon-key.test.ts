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

test("키 상태는 정상·폐기·호출 한도·점검·연결 장애를 구분하고 비밀값은 포함하지 않는다", async () => {
  const { keyHealth } = await import("../src/services/nexon-traffic");
  const key = `test_${"h".repeat(40)}`;
  const original = globalThis.fetch;
  let reply = { status: 200, body: { ocid: "x" } as unknown };
  globalThis.fetch = (async () => Response.json(reply.body, { status: reply.status })) as typeof fetch;
  try {
    await nexonGet("/id", key);
    const success = keyHealth(key).successAt; assert.ok(success);
    for (const [code, state] of [["OPENAPI00005", "invalid"], ["OPENAPI00007", "limited"], ["OPENAPI00011", "maintenance"]] as const) {
      reply = { status: 400, body: { error: { name: code } } };
      await assert.rejects(nexonGet("/id", key));
      assert.equal(keyHealth(key).state, state); assert.equal(keyHealth(key).successAt, success);
    }
    globalThis.fetch = (async () => { throw Error("network"); }) as typeof fetch;
    await assert.rejects(nexonGet("/id", key)); assert.equal(keyHealth(key).state, "unavailable");
    assert.ok(!JSON.stringify(keyHealth(key)).includes(key));
  } finally { globalThis.fetch = original; }
});

test("실서버 회귀: /id 확인용 이름의 HTTP 400 OPENAPI00003은 키 등록을 막지 않는다", async () => {
  const { findOcid } = await import("../src/services/nexon");
  const key = `test_${"probe".repeat(8)}`;
  const nexon = fakeNexon(() => ({ status: 400, body: { error: { name: "OPENAPI00003" } } }));
  try {
    assert.equal(await keyAccepted(key), true);
    await assert.rejects(findOcid("실제캐릭터", key), "실제 캐릭터 조회 오류는 삼키지 않는다");
  } finally { nexon.restore(); }
});

test("확인용 이름 예외가 잘못된 키·HTTP 인증 거부·점검·한도·서버 오류까지 허용하지 않는다", async () => {
  const cases = [
    [400, "OPENAPI00002", false], [400, "OPENAPI00005", false], [401, "OPENAPI00003", false],
    [429, "OPENAPI00007", "throw"], [400, "OPENAPI00011", "throw"], [503, "OPENAPI00003", "throw"],
  ] as const;
  for (const [status, code, expected] of cases) {
    const key = `test_${status}_${code}_${"x".repeat(16)}`;
    const nexon = fakeNexon(() => ({ status, body: { error: { name: code } } }));
    try {
      if (expected === "throw") await assert.rejects(keyAccepted(key));
      else assert.equal(await keyAccepted(key), expected);
    } finally { nexon.restore(); }
  }
});

test("등록 오류는 HTTP와 정형 코드만 표시하고 알 수 없는 응답 내용을 노출하지 않는다", async () => {
  const { nexonFailure, NexonError } = await import("../src/services/nexon");
  assert.match(nexonFailure(new NexonError("OPENAPI99999", 403)), /HTTP 403, OPENAPI99999/);
  const secret = "unexpected-private-response";
  assert.ok(!nexonFailure(new NexonError(secret, 502)).includes(secret));
});
