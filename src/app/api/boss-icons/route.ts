import { readdir } from "node:fs/promises";
import path from "node:path";
import { BOSSES } from "@/data/bosses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const KEYS = new Set(BOSSES.map(boss => boss.key));
const TYPES = [".webp", ".png", ".jpg", ".jpeg", ".gif"];

/**
 * public/bosses에 넣어 둔 보스 얼굴 이미지 목록({ 보스 key: 파일명 }). 파일명은 보스 key + 확장자다(예: lucid.png).
 * 빌드 뒤에 파일을 넣어도 다시 빌드하지 않고 보인다. 없는 보스는 화면이 이름 글자 아이콘으로 대신한다.
 */
export async function GET() {
  const icons: Record<string, string> = {};
  try {
    for (const file of await readdir(path.resolve(process.cwd(), "public", "bosses"))) {
      const ext = path.extname(file).toLowerCase(); const key = path.basename(file, path.extname(file));
      if (TYPES.includes(ext) && KEYS.has(key) && !icons[key]) icons[key] = file;
    }
  } catch { /* 폴더가 없으면 아이콘 없음 */ }
  return Response.json({ icons }, { headers: { "Cache-Control": "no-store" } });
}
