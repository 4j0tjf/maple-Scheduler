import { CHARACTER_NAME } from "@/services/accounts";
import { denied, json, LOGIN_REQUIRED, sameSite, sessionAccount } from "@/services/access";
import { accountKey, lookupCharacter, syncError } from "@/services/character-sync";
import { ExpiringCache } from "@/services/expiring-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Found = { name: string; image: string | null; level: number | null; job: string | null; world: string | null };
/** 같은 계정이 같은 이름을 다시 물으면 한 시간 동안 저장본을 준다(계산기는 캐릭터를 추가할 때와 하루 지난 정보만 다시 묻는다). */
const shared = globalThis as typeof globalThis & { mapleGahoLookups?: ExpiringCache<Found> };
const cache = shared.mapleGahoLookups ??= new ExpiringCache<Found>(3600_000, 2000);

/**
 * 유챔 가호 계산기의 캐릭터 조회. ?name=캐릭터명 → { name, image, level, job, world }.
 * 로그인한 계정의 넥슨 API 키로 찾고, 스케줄러에 캐릭터를 등록하지 않는다.
 */
export async function GET(request: Request) {
  const cross = sameSite(request); if (cross) return cross;
  const name = (new URL(request.url).searchParams.get("name") ?? "").replace(/\s/g, "");
  if (!CHARACTER_NAME.test(name)) return denied("캐릭터명은 한글·영문·숫자 2~12자입니다.", 400);
  try {
    const account = await sessionAccount(request); if (!account) return denied(LOGIN_REQUIRED, 401);
    const cacheKey = `${account.id}:${name.toLowerCase()}`;
    const cached = cache.get(cacheKey); if (cached) return json(cached);
    const key = await accountKey(account.id);
    if (!key) return denied("스케줄러에 넥슨 API 키를 등록하면 캐릭터 정보를 불러옵니다.", 409);
    let found: Awaited<ReturnType<typeof lookupCharacter>>;
    try { found = await lookupCharacter(name, key); }
    catch (error) { return denied(syncError(error), 503); }
    if (!found) return denied("넥슨에서 찾을 수 없는 캐릭터명입니다.", 404);
    const basic = found.basic;
    const view: Found = { name: basic.name ?? name, image: basic.image, level: basic.level, job: basic.className, world: basic.world };
    cache.set(cacheKey, view);
    return json(view);
  } catch { return denied("저장소에 연결할 수 없습니다.", 503); }
}
