/**
 * 유챔 가호 계산기(maple-uchampgaho-calc, 같은 도메인의 /gaho)의 계정별 값.
 * 세션 쿠키는 /scheduler 아래에만 가므로 계산기 서버가 아니라 계산기 화면이 이 서버(/scheduler/api/gaho)를 직접 부른다.
 * 값은 계산기 화면의 상태 형식(JSON) 그대로 둔다: { version, active, profiles: [{ id, name, coins, characters: [...] , ... }] }.
 * 넥슨 계정 탭(profiles)마다 챔피언 코인과 캐릭터가 따로다. 여기서는 크기와 큰 틀만 확인하고, 칸마다의 값은 화면이 읽을 때 다시 정리한다.
 */
export const GAHO_MAX_BYTES = 256_000;
export const GAHO_MAX_PROFILES = 20;
export const GAHO_MAX_CHARACTERS = 60;

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** 저장할 수 있는 계산기 값이면 그대로, 아니면 null. 넥슨 계정 탭 1~20개, 탭마다 캐릭터 60명까지. */
export function readGahoState(value: unknown): JsonObject | null {
  if (!isObject(value) || !Array.isArray(value.profiles)) return null;
  if (!value.profiles.length || value.profiles.length > GAHO_MAX_PROFILES) return null;
  for (const profile of value.profiles) {
    if (!isObject(profile) || !Array.isArray(profile.characters)) return null;
    if (profile.characters.length > GAHO_MAX_CHARACTERS || !profile.characters.every(isObject)) return null;
  }
  return value;
}

/**
 * 다른 기기·창에서 먼저 저장했는지. 화면은 불러온 때의 updatedAt을 base로 보내고,
 * 저장본이 그보다 새로우면 덮어쓰지 않고 저장본을 돌려준다(오래 열어 둔 창이 새 값을 지우지 않게).
 */
export function staleBase(saved: Date | null | undefined, base: unknown) {
  if (!saved) return false;
  return typeof base !== "string" || base !== saved.toISOString();
}
