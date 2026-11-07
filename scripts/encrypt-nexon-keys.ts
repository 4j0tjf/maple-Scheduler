/** 기본은 검증만 한다. --apply는 행 잠금을 건 트랜잭션으로 기존 평문을 암호화한다. */
import "dotenv/config";
import { Pool } from "pg";
import { decryptKey, encryptKey, encryptionKey, isEncryptedKey } from "../src/services/key-encryption";
async function main() {
  encryptionKey();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const rows = await db.query<{ id: string; nexon_api_key: string }>('SELECT id, nexon_api_key FROM accounts WHERE nexon_api_key IS NOT NULL FOR UPDATE');
    let legacy = 0;
    for (const row of rows.rows) {
      if (isEncryptedKey(row.nexon_api_key)) { decryptKey(row.nexon_api_key, row.id); continue; }
      legacy++;
      if (process.argv.includes("--apply")) await db.query('UPDATE accounts SET nexon_api_key=$1 WHERE id=$2', [encryptKey(row.nexon_api_key, row.id), row.id]);
    }
    await db.query("COMMIT");
    console.log(`키 ${rows.rowCount}개 검증 완료. 기존 평문 ${legacy}개${process.argv.includes("--apply") ? " 암호화 완료" : " (변환: npm run keys:encrypt -- --apply)"}.`);
  } catch {
    await db.query("ROLLBACK");
    throw new Error("키 변환 실패: DB 연결·마이그레이션·암호화 키를 확인하세요. 변경은 롤백했습니다.");
  } finally { db.release(); await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
