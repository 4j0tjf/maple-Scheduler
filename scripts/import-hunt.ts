/**
 * 기존 사냥 기록(maple-hunt)을 스케줄러 계정 하나로 한꺼번에 옮긴다. 관리자용이다.
 * 각자 옮길 때는 화면의 '기존 사냥 기록 가져오기'(기존 캐릭터 비밀번호 확인)를 쓴다.
 *
 *   npm run hunt:import -- --account <아이디>                      기존 캐릭터 목록과 옮길 기록 수만 보여 준다.
 *   npm run hunt:import -- --account <아이디> --names 캐릭A,캐릭B   그 캐릭터만 본다.
 *   npm run hunt:import -- --account <아이디> --apply              실제로 옮긴다(기존 DB는 읽기만 한다).
 *
 * 다른 계정으로 이미 옮긴 기존 캐릭터는 건너뛴다. 같은 계정으로 다시 실행하면 새로 생긴 기록만 더한다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { importLegacyCharacter, legacyPool, listLegacyCharacters } from "../src/services/legacy-hunt";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
const username = option("--account")?.toLowerCase();
const names = option("--names")?.split(",").map(name => name.trim()).filter(Boolean) ?? null;
const apply = process.argv.includes("--apply");

// 이 프로젝트는 CommonJS로 변환되므로 최상위 await 대신 함수로 감싼다.
async function main() {
  if (!username) throw new Error("사용법: npm run hunt:import -- --account <아이디> [--names 캐릭A,캐릭B] [--apply]");
  const pool = legacyPool(); if (!pool) throw new Error("HUNT_DATABASE_URL이 없습니다. .env에 기존 maple_hunt DB 주소를 넣으세요.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const account = await prisma.account.findUnique({ where: { username } });
    if (!account) throw new Error(`스케줄러 계정 ${username}이(가) 없습니다. 먼저 화면에서 회원가입하세요.`);
    const legacy = (await listLegacyCharacters(pool)).filter(row => !names || names.includes(row.name));
    if (names) for (const name of names) if (!legacy.some(row => row.name === name)) console.log(`?  ${name}: 기존 사냥 기록에 없는 캐릭터`);
    let position = (await prisma.character.aggregate({ where: { accountId: account.id }, _max: { position: true } }))._max.position ?? -1;
    for (const row of legacy) {
      const previous = await prisma.huntImport.findUnique({ where: { legacyCharacterId: row.id } });
      const owner = previous && await prisma.character.findUnique({ where: { id: previous.characterId }, select: { accountId: true } });
      if (owner && owner.accountId !== account.id) { console.log(`-  ${row.name}: 다른 계정으로 이미 옮김 · 건너뜀`); continue; }
      if (!apply) { console.log(`·  ${row.name}: 기록 ${row.records}건${previous ? " · 다시 옮기면 새 기록만 더함" : ""}`); continue; }
      const character = await prisma.character.findFirst({ where: { accountId: account.id, name: row.name }, select: { id: true, name: true } })
        ?? await prisma.character.create({ data: { accountId: account.id, name: row.name, position: ++position }, select: { id: true, name: true } });
      const result = await importLegacyCharacter(prisma, pool, row, character);
      console.log(`✓  ${row.name}: 새 기록 ${result.records}건 · 갱신 ${result.updated}건 · 건너뜀 ${result.skipped}건 · 증거 이미지 ${result.evidence}장`);
    }
    if (!apply) console.log("옮기려면 --apply를 붙이세요. 이미지·레벨은 스케줄러 화면을 열면 넥슨 API에서 채웁니다.");
  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
