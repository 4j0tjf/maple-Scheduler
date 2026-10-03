/** 임시 계정 하나로 로컬 서버의 가입·로그인·사냥터 API를 확인하고 finally에서 그 계정만 지운다. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { mapCatalogSchema } from "../src/services/map-catalog";

const base = process.argv[2] ?? "http://127.0.0.1:3300/scheduler";
const address = new URL(base);
if (address.hostname !== "127.0.0.1") throw new Error("이 점검은 로컬 서버에서만 실행합니다.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const username = `check_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const session = (body: object) => fetch(`${base}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/maps`)).status, 401);
    assert.equal((await session({ mode: "login", username, password })).status, 401);
    const signup = await session({ mode: "signup", username, password }); assert.equal(signup.status, 201);
    const cookie = signup.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie, "세션 쿠키");
    const maps = await fetch(`${base}/api/maps`, { headers: { Cookie: cookie } });
    assert.equal(maps.status, 200); assert.equal(maps.headers.get("cache-control"), "no-store");
    const catalog = mapCatalogSchema.parse(await maps.json());
    const characters = await fetch(`${base}/api/characters`, { headers: { Cookie: cookie } }); assert.equal(characters.status, 200);
    console.log(`API 확인: 가입·로그인 정상, 사냥터 ${catalog.maps.length}개(${catalog.version})`);
  } finally {
    await prisma.account.deleteMany({ where: { username } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
