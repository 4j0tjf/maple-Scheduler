import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { BOSSES } from "@/data/bosses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const KEYS = new Set(BOSSES.map(boss => boss.key));
const TYPES: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };
const MAX_BYTES = 2_000_000;
const folder = () => path.resolve(process.cwd(), "public", "bosses");

/** public/bosses의 { 보스 key: 파일명 }. 파일명은 보스 key + 확장자다(예: lucid.png). */
async function icons() {
  const found: Record<string, string> = {};
  try {
    for (const file of (await readdir(folder())).sort()) {
      const ext = path.extname(file).toLowerCase(); const key = path.basename(file, path.extname(file));
      if (TYPES[ext] && KEYS.has(key) && !found[key]) found[key] = file;
    }
  } catch { /* 폴더가 없으면 아이콘 없음 */ }
  return found;
}

/**
 * 보스 얼굴 아이콘. 목록(?key 없음)은 { icons: { key: 파일명 } }, ?key=<보스 key>는 그 이미지 파일이다.
 * 운영 서버(next start)는 public 폴더를 시작할 때 한 번만 읽어 그 뒤에 넣은 파일을 주지 않으므로, 이미지도 이 라우트가 직접 읽어 준다.
 * 그래서 public/bosses에 파일을 넣으면 다시 빌드하거나 서비스를 재시작하지 않아도 새로고침만으로 보인다.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  const found = await icons();
  if (!key) return Response.json({ icons: found }, { headers: { "Cache-Control": "no-store" } });
  const file = found[key];
  if (!file) return new Response(null, { status: 404 });
  try {
    const target = path.join(folder(), file);
    if ((await stat(target)).size > MAX_BYTES) return new Response(null, { status: 413 });
    return new Response(new Uint8Array(await readFile(target)), { headers: { "Content-Type": TYPES[path.extname(file).toLowerCase()],
      "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
