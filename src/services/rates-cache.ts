import { ExpiringCache } from "./expiring-cache";
import { keyFingerprint } from "./key-encryption";
import type { CharacterInfo } from "./nexon";
const shared = globalThis as typeof globalThis & { mapleRatesCache?: ExpiringCache<CharacterInfo>; mapleOcidCache?: ExpiringCache<string> };
export const ratesCache = shared.mapleRatesCache ??= new ExpiringCache<CharacterInfo>(10 * 60_000);
export const ocidCache = shared.mapleOcidCache ??= new ExpiringCache<string>(3 * 3600_000);
export const ratesScope = (accountId: string, characterId: string, key: string) => `${accountId}:${characterId}:${keyFingerprint(key)}`;
export function invalidateAccountRates(accountId: string) {
  ratesCache.deletePrefix(`${accountId}:`); ocidCache.deletePrefix(`${accountId}:`);
}
