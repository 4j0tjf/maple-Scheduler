/**
 * 스케줄러 계정 비밀번호 초기화. 관리자용이다(서버 PC에서만 실행).
 *
 *   npm run account:reset                              가입한 계정 목록(아이디·가입일·캐릭터 수)
 *   npm run account:reset -- --account "아이디"         그 계정의 비밀번호를 임시 비밀번호로 바꾸고 화면에 보여 준다
 *
 * 임시 비밀번호로 로그인한 뒤 화면 왼쪽 위 '비밀번호 변경'에서 새 비밀번호로 바꾼다.
 * 바꾸면 그 계정의 기존 로그인(다른 기기 포함)은 모두 끊긴다. 캐릭터·보스·사냥 기록은 그대로다.
 * 로그인을 5번 틀려 10분 잠긴 상태면 nssm restart MapleSchedulerWeb으로 풀 수 있다(잠금은 서버 메모리에만 있다).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword, normalizeUsername, temporaryPassword } from "../src/services/accounts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

// 이 프로젝트는 CommonJS로 변환되므로 최상위 await 대신 함수로 감싼다.
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const username = normalizeUsername(option("--account"));
    if (!username) {
      const accounts = await prisma.account.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { characters: true } } } });
      if (!accounts.length) { console.log("가입한 계정이 없습니다."); return; }
      console.log("가입한 계정:");
      for (const row of accounts) console.log(`  ${row.username} · ${row.createdAt.toLocaleDateString("ko-KR")} 가입 · 캐릭터 ${row._count.characters}명`);
      console.log('\n초기화: npm run account:reset -- --account "아이디"');
      return;
    }
    const account = await prisma.account.findUnique({ where: { username } });
    if (!account) throw new Error(`계정 ${username}이(가) 없습니다. --account 없이 npm run account:reset 만 실행하면 계정 목록을 볼 수 있습니다.`);
    const password = temporaryPassword();
    await prisma.account.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(password) } });
    console.log(`✓ ${account.username} 계정의 비밀번호를 초기화했습니다.`);
    console.log(`  임시 비밀번호: ${password}`);
    console.log("  이 비밀번호로 로그인한 뒤 왼쪽 위 '비밀번호 변경'에서 새 비밀번호로 바꾸세요.");
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(`✗ ${error instanceof Error ? error.message : error}`); process.exit(1); });
