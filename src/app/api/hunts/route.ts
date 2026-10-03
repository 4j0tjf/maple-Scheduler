import { prisma } from "@/lib/prisma";
import { denied, json, LOGIN_REQUIRED, sessionAccount } from "@/services/access";
import type { Hunt } from "@/services/domain";
import { pricesByDay } from "@/services/market";
import { presentRecord } from "@/services/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 수익 집계에 쓰는 최근 기록 수(계정 전체). */
const LIMIT = 5000;

/**
 * 사냥 수익 탭. 계정의 모든 캐릭터의 사냥 기록을 수익 계산에 필요한 값만 추려 돌려준다.
 * 조각 시세는 사냥 시작일의 경매장 평균가(없으면 그 기록에 직접 넣은 가격)다. 화면이 날짜·주·달로 묶는다.
 */
export async function GET(request: Request) {
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const characters = await prisma.character.findMany({ where: { accountId: account.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, level: true, image: true, className: true } });
    const rows = await prisma.huntRecord.findMany({ where: { characterId: { in: characters.map(row => row.id) } }, orderBy: { startedAt: "desc" }, take: LIMIT });
    const prices = await pricesByDay([...new Set(rows.map(row => row.day))]);
    const records = rows.map(row => {
      const hunt = presentRecord(row.data as Hunt, row.updatedAt.getTime(), prices.get(row.day) ?? null, 0);
      return { id: hunt.id, characterId: row.characterId, day: row.day, startedAt: hunt.startedAt, endedAt: hunt.endedAt, status: hunt.status,
        meso: hunt.meso, fragments: hunt.fragments, auctionPrice: hunt.auctionPrice, manualPrice: hunt.manualPrice ?? null,
        map: hunt.plan?.map ?? null, potions: hunt.small + hunt.large };
    });
    return json({ characters, records, truncated: rows.length >= LIMIT });
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}
