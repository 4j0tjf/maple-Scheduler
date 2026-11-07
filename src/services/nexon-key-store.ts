import { decryptKey, encryptKey } from "./key-encryption";

/** Prisma와 테스트 저장소가 공유하는 계정 범위 인터페이스. 클라이언트가 보낸 계정 ID는 받지 않는다. */
export interface AccountKeyStore {
  findUnique(args: { where: { id: string }; select: { nexonApiKey: true } }): Promise<{ nexonApiKey: string | null } | null>;
  update(args: { where: { id: string }; data: { nexonApiKey: string | null } }): Promise<unknown>;
}
export async function readAccountKey(store: AccountKeyStore, accountId: string) {
  const row = await store.findUnique({ where: { id: accountId }, select: { nexonApiKey: true } });
  return row?.nexonApiKey ? decryptKey(row.nexonApiKey, accountId) : null;
}
export async function saveAccountKey(store: AccountKeyStore, accountId: string, key: string | null) {
  await store.update({ where: { id: accountId }, data: { nexonApiKey: key ? encryptKey(key, accountId) : null } });
}
