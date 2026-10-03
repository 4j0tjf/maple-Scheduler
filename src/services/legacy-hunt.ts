import { Pool } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 기존 사냥 기록(maple-hunt, DB maple_hunt) 가져오기.
 * 기존 앱은 그대로 두고 읽기만 한다. 기록 id를 그대로 쓰므로 여러 번 가져와도 한 벌만 남고, 기존 앱에서 새로 저장한 기록만 더해진다.
 * 화면(/api/hunt-import, 기존 캐릭터 비밀번호 확인)과 관리 명령(npm run hunt:import)이 같이 쓴다.
 */
export type LegacyCharacter = { id: string; name: string; passwordHash: string; records: number };
export type ImportResult = { records: number; updated: number; skipped: number; evidence: number };

let shared: Pool | null = null;
/** HUNT_DATABASE_URL이 없으면 null(가져오기 꺼짐). */
export function legacyPool() {
  const url = process.env.HUNT_DATABASE_URL; if (!url) return null;
  shared ??= new Pool({ connectionString: url, max: 2 });
  return shared;
}
export async function findLegacyCharacter(pool: Pool, name: string): Promise<LegacyCharacter | null> {
  const { rows } = await pool.query<{ id: string; name: string; password_hash: string; records: string }>(
    `select c.id, c.name, c.password_hash, (select count(*) from hunt_records r where r.character_id = c.id) as records
       from hunt_characters c where c.name = $1`, [name]);
  return rows[0] ? { id: rows[0].id, name: rows[0].name, passwordHash: rows[0].password_hash, records: Number(rows[0].records) } : null;
}
export async function listLegacyCharacters(pool: Pool): Promise<LegacyCharacter[]> {
  const { rows } = await pool.query<{ id: string; name: string; password_hash: string; records: string }>(
    `select c.id, c.name, c.password_hash, (select count(*) from hunt_records r where r.character_id = c.id) as records
       from hunt_characters c order by c.created_at`);
  return rows.map(row => ({ id: row.id, name: row.name, passwordHash: row.password_hash, records: Number(row.records) }));
}

/**
 * 기존 캐릭터의 기록과 증거 이미지를 스케줄러 캐릭터로 복사한다.
 * 이미 있는 기록은 기존 앱 쪽이 더 최근에 고쳐졌을 때만 덮는다. 다른 캐릭터에 같은 id의 기록이 있으면 건너뛴다.
 */
export async function importLegacyCharacter(db: PrismaClient, pool: Pool, legacy: LegacyCharacter, character: { id: string; name: string }): Promise<ImportResult> {
  const result: ImportResult = { records: 0, updated: 0, skipped: 0, evidence: 0 };
  const { rows } = await pool.query<{ id: string; started_at: Date; day: string; data: Record<string, unknown>; updated_at: Date }>(
    "select id, started_at, day, data, updated_at from hunt_records where character_id = $1 order by started_at", [legacy.id]);
  for (const row of rows) {
    const existing = await db.huntRecord.findUnique({ where: { id: row.id }, select: { characterId: true, updatedAt: true } });
    if (existing && existing.characterId !== character.id) { result.skipped++; continue; }
    const values = { startedAt: row.started_at, day: row.day, data: { ...row.data, character: character.name }, updatedAt: row.updated_at };
    if (!existing) { await db.huntRecord.create({ data: { id: row.id, characterId: character.id, ...values } }); result.records++; }
    else if (row.updated_at > existing.updatedAt) { await db.huntRecord.update({ where: { id: row.id }, data: values }); result.updated++; }
    // 증거 이미지는 기록마다 몇 장뿐이라 기록 단위로 나눠 읽는다(전체를 한 번에 메모리에 올리지 않는다).
    const evidence = await pool.query<{ id: string; kind: string; captured_at: Date; image: Buffer }>(
      "select id, kind, captured_at, image from hunt_evidence where hunt_id = $1", [row.id]);
    if (evidence.rows.length) {
      const created = await db.huntEvidence.createMany({ skipDuplicates: true,
        data: evidence.rows.map(item => ({ id: item.id, huntId: row.id, kind: item.kind, capturedAt: item.captured_at, image: new Uint8Array(item.image) })) });
      result.evidence += created.count;
    }
  }
  await db.huntImport.upsert({ where: { legacyCharacterId: legacy.id },
    create: { legacyCharacterId: legacy.id, legacyName: legacy.name, characterId: character.id, records: rows.length },
    update: { legacyName: legacy.name, characterId: character.id, records: rows.length, importedAt: new Date() } });
  return result;
}
