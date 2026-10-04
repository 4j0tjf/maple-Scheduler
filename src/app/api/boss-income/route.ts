import { prisma } from "@/lib/prisma";
import { findBoss } from "@/data/bosses";
import { denied, json, LOGIN_REQUIRED, sessionAccount } from "@/services/access";
import { bossIncome } from "@/services/boss-income";
import { periodOf } from "@/services/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 보스 수익 탭. 계정의 모든 캐릭터의 처치 기록을 캐릭터·주기(주·달)별 수익으로 묶어 돌려준다. 화면이 달별로 모은다.
 * 목록에서 삭제한 보스는 주간 보스 탭처럼 이번 주기 처치에서 뺀다. 지난 주기는 그때 기록 그대로 센다.
 */
export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const now = Date.now();
    const characters = await prisma.character.findMany({ where: { accountId: account.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, level: true, image: true } });
    const ids = characters.map(row => row.id);
    const [clears, hidden] = await Promise.all([
      prisma.bossClear.findMany({ where: { characterId: { in: ids } }, select: { characterId: true, period: true, boss: true, price: true, partySize: true } }),
      prisma.bossSetting.findMany({ where: { characterId: { in: ids }, hidden: true }, select: { characterId: true, boss: true } }),
    ]);
    const skip = new Set(hidden.map(row => `${row.characterId}|${row.boss}`));
    const records = clears.filter(row => !(skip.has(`${row.characterId}|${row.boss}`) && row.period === periodOf(findBoss(row.boss)?.cycle ?? "weekly", now)))
      .map(row => ({ ...row, price: Number(row.price) }));
    return json({ now, characters, income: bossIncome(records) });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}
