/**
 * 서버 PC 처음 설치 도우미. 기존 사냥 기록(maple-hunt) 폴더를 주면 다음을 한다. 이미 된 단계는 건너뛴다.
 *
 *   1. .env가 없으면 maple-hunt/.env의 DB 계정·넥슨 API 키·시세 주소로 만든다(DB 이름만 maple_scheduler).
 *   2. DATABASE_URL의 데이터베이스가 없으면 만든다(psql 없이).
 *   3. 사냥터 목록(data/hunting-maps.json)이 없으면 maple-hunt에서 복사한다.
 *   4. 기존 사냥 기록 DB에 연결되는지 확인하고 캐릭터·기록 수를 보여 준다.
 *
 *   npm run setup -- ..\maple-hunt
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { Client } from "pg";

const root = process.cwd();
const huntDir = path.resolve(root, process.argv[2] ?? "../maple-hunt");
const envPath = path.join(root, ".env");
const readEnv = (file: string) => parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const withDatabase = (url: string, name: string) => { const next = new URL(url); next.pathname = `/${name}`; return next.toString(); };
const databaseOf = (url: string) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

// 이 프로젝트는 CommonJS로 변환되므로 최상위 await 대신 함수로 감싼다.
async function main() {
  // 1. .env
  if (existsSync(envPath)) console.log("✓ .env가 이미 있어 그대로 씁니다.");
  else {
    const huntEnv = path.join(huntDir, ".env");
    if (!existsSync(huntEnv)) throw new Error(`기존 사냥 기록의 .env를 찾지 못했습니다: ${huntEnv}\n  npm run setup -- <maple-hunt 폴더> 로 위치를 알려 주세요.`);
    const old = readEnv(huntEnv);
    if (!old.DATABASE_URL) throw new Error(`${huntEnv}에 DATABASE_URL이 없습니다.`);
    const lines = [
      `DATABASE_URL="${withDatabase(old.DATABASE_URL, "maple_scheduler")}"`,
      `HUNT_DATABASE_URL="${old.DATABASE_URL}"`,
      `MARKET_URL="${old.MARKET_URL || "http://127.0.0.1:3000"}"`,
      `NEXON_API_KEY="${old.NEXON_API_KEY ?? ""}"`,
    ];
    // BOM 없이 쓴다(BOM이 있으면 첫 줄의 이름을 못 읽는다).
    writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
    console.log(`✓ .env를 만들었습니다(${huntEnv}의 DB 계정·넥슨 키·시세 주소 사용).`);
    if (!old.NEXON_API_KEY) console.log("  ! NEXON_API_KEY가 비어 있습니다. .env에 넣어야 캐릭터 이미지·보스 정보를 가져옵니다.");
  }
  const env = readEnv(envPath);
  if (!env.DATABASE_URL) throw new Error(".env에 DATABASE_URL이 없습니다.");

  // 2. 데이터베이스
  const name = databaseOf(env.DATABASE_URL);
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`데이터베이스 이름이 올바르지 않습니다: ${name}`);
  const admin = new Client({ connectionString: withDatabase(env.DATABASE_URL, "postgres") });
  await admin.connect();
  try {
    const found = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (found.rowCount) console.log(`✓ 데이터베이스 ${name}이(가) 이미 있습니다.`);
    else {
      try { await admin.query(`CREATE DATABASE "${name}"`); }
      catch (error) { throw new Error(`데이터베이스 ${name}을(를) 만들지 못했습니다(${(error as Error).message}). pgAdmin 등에서 직접 만든 뒤 다시 실행하세요.`); }
      console.log(`✓ 데이터베이스 ${name}을(를) 만들었습니다.`);
    }
  } finally { await admin.end(); }

  // 3. 사냥터 목록
  const maps = path.join(root, "data", "hunting-maps.json"); const oldMaps = path.join(huntDir, "data", "hunting-maps.json");
  if (existsSync(maps)) console.log("✓ 사냥터 목록(data/hunting-maps.json)이 이미 있습니다.");
  else if (existsSync(oldMaps)) { mkdirSync(path.dirname(maps), { recursive: true }); copyFileSync(oldMaps, maps); console.log("✓ 사냥터 목록을 maple-hunt에서 복사했습니다."); }
  else console.log("- maple-hunt에 사냥터 목록이 없어 건너뜁니다(나중에 docs/hunting-map-data.md 절차로 등록).");

  // 4. 기존 사냥 기록 DB
  if (!env.HUNT_DATABASE_URL) console.log("- HUNT_DATABASE_URL이 없어 기존 기록 가져오기를 쓸 수 없습니다.");
  else {
    const hunt = new Client({ connectionString: env.HUNT_DATABASE_URL });
    try {
      await hunt.connect();
      const { rows } = await hunt.query<{ characters: string; records: string }>(
        "select (select count(*) from hunt_characters) as characters, (select count(*) from hunt_records) as records");
      console.log(`✓ 기존 사냥 기록 DB 연결됨: 캐릭터 ${rows[0].characters}명 · 기록 ${rows[0].records}건`);
    } catch (error) { console.log(`! 기존 사냥 기록 DB에 연결하지 못했습니다: ${(error as Error).message}`); }
    finally { await hunt.end().catch(() => {}); }
  }
  console.log("\n다음: npx prisma migrate deploy → npm run build");
}
main().catch(error => { console.error(`✗ ${error instanceof Error ? error.message : error}`); process.exit(1); });
